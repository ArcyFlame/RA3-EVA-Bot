import {
  Attachment,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Guild,
  Message,
  MessageReaction,
  PartialMessageReaction,
  PartialUser,
  PermissionFlagsBits,
  TextChannel,
  User,
  escapeMarkdown,
} from 'discord.js';
import { replayRatingRepository, ReplayRatingCard } from '../repositories/replay-rating.repository';
import { activityRankRepository } from '../repositories/activity-rank.repository';
import { guildRepository } from '../repositories/guild.repository';
import { activityRankService, isReplayAttachment } from './activity-rank.service';
import { audit, logger } from '../utils/logger';
import { userRepository } from '../repositories/user.repository';
import { t } from '../utils/i18n';

const day = () => new Date().toISOString().slice(0, 10);
export function replayRatingEmbed(card: ReplayRatingCard): EmbedBuilder {
  const counts = replayRatingRepository.totals(card.id);
  const both = activityRankRepository.getSettings(card.guild_id).ratingMode === 'both';
  return new EmbedBuilder()
    .setTitle('🎬 Generals Evolution Replay')
    .setColor(0xd6ad43)
    .setDescription(
      `**${escapeMarkdown(card.filename)}**\nUploaded by <@${card.user_id}>\n` +
        (card.description ? escapeMarkdown(card.description) + '\n' : '') +
        `[Download the replay](https://discord.com/channels/${card.guild_id}/${card.channel_id}/${card.card_message_id ?? card.source_message_id})`,
    )
    .addFields(
      {
        name: 'Community Rating',
        value: `👍 **${counts.up}**` + (both ? `   👎 **${counts.down}**` : ''),
        inline: true,
      },
      { name: 'Rating Bonus', value: `**${card.bonus_awarded} XP** earned`, inline: true },
    )
    .setFooter({
      text: `Replay #${card.id} - ${both ? 'One active vote per member; your latest vote counts.' : 'One upvote per member.'} No self-votes. XP is capped.`,
    });
}

export function replayRatingControls(card: ReplayRatingCard) {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`replay_manage:edit:${card.id}:${card.revision ?? 0}`)
        .setLabel('Edit Replay')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`replay_manage:remove:${card.id}:${card.revision ?? 0}`)
        .setLabel('Remove Replay')
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

export class ReplayRatingService {
  private posting = new Set<string>();
  private queues = new Map<number, Promise<void>>();
  private queued = 0;
  private refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private selfVotes = new Set<string>();

  private async rejectSelfVote(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
    card: ReplayRatingCard,
  ): Promise<void> {
    const key = card.id + ':' + user.id;
    if (this.selfVotes.has(key) || this.selfVotes.size >= 200) return;
    this.selfVotes.add(key);
    try {
      let removed = false;
      try {
        await reaction.users.remove(user.id);
        removed = true;
      } catch {
        logger.debug(
          'Self-vote ignored; reaction removal needs Manage Messages in the replay channel.',
        );
      }
      if (replayRatingRepository.claimSelfVoteNotice(card.guild_id, user.id)) {
        const lang = userRepository.getLanguage(user.id);
        const recipient = user.partial ? await user.fetch().catch(() => null) : user;
        await recipient
          ?.send({
            content: t(lang, removed ? 'replay.selfVoteRemoved' : 'replay.selfVoteIgnored'),
            allowedMentions: { parse: [] },
          })
          .catch(() => undefined);
      }
    } catch (error) {
      logger.debug('Self-vote notice could not be delivered:', error);
    } finally {
      this.selfVotes.delete(key);
    }
  }

  async reconcileRecentCards(client: Client, guildId?: string): Promise<void> {
    for (const settings of guildRepository.getAllGuilds()) {
      if (guildId && settings.discordId !== guildId) continue;
      const channelId = activityRankRepository.getSettings(settings.discordId).replayChannelId;
      if (!this.enabled(settings.discordId, channelId)) continue;
      try {
        const guild = client.guilds.cache.get(settings.discordId);
        const channel = await guild?.channels.fetch(channelId);
        if (!(channel instanceof TextChannel)) continue;
        const messages = await channel.messages.fetch({ limit: 50 });
        for (const message of messages.values()) {
          const card = replayRatingRepository.findMessage(message.id);
          if (
            !card ||
            card.closed ||
            message.author.id !== client.user?.id ||
            card.guild_id !== guild?.id ||
            card.channel_id !== channel.id
          )
            continue;
          this.refresh(message, card.id);
        }
        if (activityRankRepository.getSettings(settings.discordId).replayAutoScan && guild) {
          const recovered = await this.scan(guild, { automatic: true });
          if (recovered.cards) {
            audit('replay_rating_recovered', { guildId: guild.id, ...recovered });
          }
        }
      } catch (error) {
        logger.warn('Existing replay cards could not be refreshed:', error);
      }
    }
  }

  private enabled(guildId: string, channelId: string): boolean {
    const guild = guildRepository.findByDiscordId(guildId);
    if (guild?.game !== 'genevo' || guild.activityRanksEnabled !== 1) return false;
    const settings = activityRankRepository.getSettings(guildId);
    return (
      settings.replayEnabled && settings.ratingsEnabled && settings.replayChannelId === channelId
    );
  }

  async post(
    message: Message,
    attachment: Attachment,
    fingerprint: string,
    verified?: { bytes: Buffer; fingerprint: string },
  ): Promise<boolean> {
    if (!message.guild || !this.enabled(message.guild.id, message.channelId)) return false;
    const creditedOwner = activityRankRepository.getReplayOwner(message.guild.id, fingerprint);
    if (creditedOwner && creditedOwner !== message.author.id) return false;
    const key = message.guild.id + ':' + fingerprint;
    if (this.posting.has(key)) return false;
    this.posting.add(key);
    try {
      const card = replayRatingRepository.create({
        guild_id: message.guild.id,
        user_id: message.author.id,
        channel_id: message.channelId,
        source_message_id: message.id,
        attachment_id: attachment.id,
        fingerprint,
        filename: attachment.name ?? 'Replay.RA3Replay',
      });
      if (
        card.closed ||
        card.user_id !== message.author.id ||
        !(message.channel instanceof TextChannel)
      )
        return false;
      if (!message.guild.members.me) return false;
      const permissions = message.channel.permissionsFor(message.guild.members.me);
      if (
        !permissions?.has([
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AddReactions,
          PermissionFlagsBits.ReadMessageHistory,
        ])
      ) {
        logger.warn('Replay rating card needs channel permissions.', {
          guildId: message.guild.id,
          channelId: message.channelId,
        });
        return false;
      }
      let existing = card.card_message_id
        ? await message.channel.messages.fetch(card.card_message_id).catch(() => null)
        : null;
      if (card.card_message_id && !existing) return false;
      if (existing && existing.author.id !== message.client.user?.id) return false;
      if (existing?.attachments.has(card.archive_attachment_id ?? '')) {
        await this.hideSource(message);
        return false;
      }
      const file =
        verified?.fingerprint === fingerprint
          ? verified
          : await activityRankService.downloadReplayFile(attachment);
      if (!file || file.fingerprint !== fingerprint) return false;
      // Recover a send that succeeded just before a crash, without posting the same card again.
      const recent = await message.channel.messages.fetch({ limit: 50 });
      existing ??=
        recent.find(
          (m) =>
            m.author.id === message.client.user?.id &&
            m.embeds.some((e) => e.footer?.text?.startsWith(`Replay #${card.id} - `)),
        ) ?? null;
      const sent =
        existing ??
        (await message.channel.send({
          embeds: [replayRatingEmbed(card)],
          files: [{ attachment: file.bytes, name: card.filename }],
          components: replayRatingControls(card),
          allowedMentions: { parse: [], repliedUser: false },
        }));
      replayRatingRepository.attachMessage(card.id, sent.id);
      if (!sent.attachments.size) {
        const archived = await sent.edit({
          files: [{ attachment: file.bytes, name: card.filename }],
        });
        const copy = archived.attachments.first();
        if (!copy) return false;
        replayRatingRepository.archive(card.id, copy.id, message.content ?? '');
      } else {
        const copy = sent.attachments.find((a) => a.name === card.filename);
        if (!copy) return false;
        replayRatingRepository.archive(card.id, copy.id, message.content ?? '');
      }
      const updated = replayRatingRepository.get(card.id)!;
      await sent.edit({
        embeds: [replayRatingEmbed(updated)],
        components: replayRatingControls(updated),
        allowedMentions: { parse: [] },
      });
      await sent.react('👍').catch(() => null);
      if (activityRankRepository.getSettings(card.guild_id).ratingMode === 'both')
        await sent.react('👎').catch(() => null);
      if (!existing)
        audit('replay_rating_posted', {
          guildId: card.guild_id,
          userId: card.user_id,
          cardId: card.id,
          messageId: sent.id,
        });
      await this.hideSource(message);
      return !existing;
    } catch (error) {
      logger.warn('Replay rating card could not be posted:', error);
      return false;
    } finally {
      this.posting.delete(key);
    }
  }

  async hideSource(message: Message): Promise<boolean> {
    if (
      !message.guild ||
      !this.enabled(message.guild.id, message.channelId) ||
      !(message.channel instanceof TextChannel) ||
      !activityRankRepository.getSettings(message.guild.id).replayAutoScan ||
      !message.attachments?.size ||
      (message.content?.length ?? 0) > 1500 ||
      !message.guild.members.me ||
      !message.channel
        .permissionsFor(message.guild.members.me)
        ?.has(PermissionFlagsBits.ManageMessages)
    )
      return false;
    const cards = replayRatingRepository.bySource(message.guild.id, message.id);
    for (const attachment of message.attachments.values()) {
      if (!isReplayAttachment(attachment, message.channelId)) return false;
      const card = cards.find(
        (c) =>
          c.attachment_id === attachment.id &&
          c.user_id === message.author.id &&
          !c.closed &&
          c.archive_attachment_id &&
          c.card_message_id,
      );
      if (!card) return false;
      const copy = await message.channel.messages.fetch(card.card_message_id!).catch(() => null);
      if (
        !copy ||
        copy.author.id !== message.client.user?.id ||
        !copy.attachments.has(card.archive_attachment_id!)
      )
        return false;
    }
    try {
      await message.delete();
      audit('replay_source_archived', { guildId: message.guild.id, messageId: message.id });
      return true;
    } catch {
      return false;
    }
  }

  async handleReaction(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
    remove = false,
  ): Promise<void> {
    const vote = reaction.emoji.name === '👍' ? 1 : -1;
    if (!['👍', '👎'].includes(reaction.emoji.name ?? '') || user.bot || this.queued >= 200) return;
    const card = replayRatingRepository.findMessage(reaction.message.id);
    if (!card || card.closed || !this.enabled(card.guild_id, card.channel_id)) return;
    if (
      reaction.message.guildId !== card.guild_id ||
      reaction.message.channelId !== card.channel_id
    )
      return;
    if (card.user_id === user.id) {
      if (!remove) await this.rejectSelfVote(reaction, user, card);
      return;
    }
    if (vote === -1 && activityRankRepository.getSettings(card.guild_id).ratingMode !== 'both')
      return;
    this.queued++;
    const previous = this.queues.get(card.id) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        const guild = reaction.message.guild;
        if (!guild || !this.enabled(guild.id, card.channel_id)) return;
        // Unknown cards are discarded above, before any network fetch.
        const member = await guild.members.fetch({ user: user.id, force: true }).catch(() => null);
        const settings = activityRankRepository.getSettings(guild.id);
        if (
          !member ||
          member.user.bot ||
          (!remove &&
            Date.now() - member.user.createdTimestamp < settings.ratingAccountDays * 86400000)
        )
          return;
        if (!this.enabled(guild.id, card.channel_id)) return;
        const points = replayRatingRepository.vote(card.id, user.id, vote as -1 | 1, remove, day());
        this.refresh(reaction.message as Message, card.id);
        if (points) {
          const author = await guild.members.fetch(card.user_id).catch(() => null);
          if (author && this.enabled(guild.id, card.channel_id))
            await activityRankService.syncMemberRank(author);
          audit('replay_rating_xp', {
            guildId: guild.id,
            userId: card.user_id,
            cardId: card.id,
            points,
          });
        }
      })
      .catch((error) => {
        logger.warn('Replay rating could not be processed:', error);
      })
      .finally(() => {
        this.queued--;
        if (this.queues.get(card.id) === next) this.queues.delete(card.id);
      });
    this.queues.set(card.id, next);
    await next;
  }

  refresh(message: Message, cardId: number): void {
    if (this.refreshTimers.has(message.id) || this.refreshTimers.size >= 200) return;
    const timer = setTimeout(() => {
      this.refreshTimers.delete(message.id);
      const card = replayRatingRepository.get(cardId);
      if (!card || card.closed || !this.enabled(card.guild_id, card.channel_id)) return;
      void message
        .fetch()
        .then(async (full) => {
          await full.edit({
            embeds: [replayRatingEmbed(card)],
            components: replayRatingControls(card),
            allowedMentions: { parse: [] },
          });
          await full.react('👍').catch(() => undefined);
          const down = full.reactions.cache.get('👎');
          if (activityRankRepository.getSettings(card.guild_id).ratingMode === 'both')
            await full.react('👎').catch(() => undefined);
          else if (down?.me && full.client.user)
            await down.users.remove(full.client.user.id).catch(() => undefined);
        })
        .catch(() => undefined);
    }, 2000);
    timer.unref();
    this.refreshTimers.set(message.id, timer);
  }

  async clear(message: Message, vote?: -1 | 1): Promise<void> {
    if (this.queued >= 200) return;
    const card = replayRatingRepository.findMessage(message.id);
    if (!card || !this.enabled(card.guild_id, card.channel_id)) return;
    // Keep clears in gateway order with pending member checks for this card.
    const previous = this.queues.get(card.id) ?? Promise.resolve();
    this.queued++;
    const next = previous
      .catch(() => undefined)
      .then(() => {
        if (!this.enabled(card.guild_id, card.channel_id)) return;
        replayRatingRepository.clearVotes(message.id, vote);
        this.refresh(message, card.id);
      })
      .finally(() => {
        this.queued--;
        if (this.queues.get(card.id) === next) this.queues.delete(card.id);
      });
    this.queues.set(card.id, next);
    await next;
  }

  async scan(
    guild: Guild,
    options: { automatic?: boolean } = {},
  ): Promise<{ cards: number; checked: number }> {
    const settings = activityRankRepository.getSettings(guild.id);
    if (!this.enabled(guild.id, settings.replayChannelId))
      throw new Error('Enable GenEvo activity, replay XP and ratings first.');
    if (options.automatic && !settings.replayAutoScan) return { cards: 0, checked: 0 };
    if (!replayRatingRepository.claimScan(guild.id)) {
      if (options.automatic) return { cards: 0, checked: 0 };
      throw new Error('Wait 10 minutes before scanning again.');
    }
    const channel = await guild.channels.fetch(settings.replayChannelId);
    if (!(channel instanceof TextChannel))
      throw new Error('Choose a server text channel for replays.');
    const messages = await channel.messages.fetch({ limit: 100 });
    let cards = 0,
      checked = 0;
    for (const message of [...messages.values()].sort((a, b) =>
      options.automatic
        ? b.createdTimestamp - a.createdTimestamp
        : a.createdTimestamp - b.createdTimestamp,
    )) {
      if (
        message.author.bot ||
        message.webhookId ||
        message.system ||
        Date.now() - message.createdTimestamp > 30 * 86400000
      )
        continue;
      for (const attachment of message.attachments.values()) {
        if (cards >= 10 || checked >= 20) return { cards, checked };
        if (options.automatic && !activityRankRepository.getSettings(guild.id).replayAutoScan)
          return { cards, checked };
        if (!isReplayAttachment(attachment, channel.id)) continue;
        checked++;
        const fingerprint = await activityRankService.downloadReplay(attachment);
        if (
          fingerprint &&
          this.enabled(guild.id, channel.id) &&
          (!options.automatic || activityRankRepository.getSettings(guild.id).replayAutoScan)
        ) {
          const prior = replayRatingRepository.findFingerprint(guild.id, fingerprint);
          if (!prior?.closed && (await this.post(message, attachment, fingerprint))) cards++;
        }
      }
    }
    // Historical uploads get rating cards, never backdated upload XP.
    return { cards, checked };
  }
}
export const replayRatingService = new ReplayRatingService();
