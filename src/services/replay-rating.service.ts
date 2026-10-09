import {
  Attachment,
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
        `[Download the replay](https://discord.com/channels/${card.guild_id}/${card.channel_id}/${card.source_message_id})`,
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

  async post(message: Message, attachment: Attachment, fingerprint: string): Promise<boolean> {
    if (!message.guild || !this.enabled(message.guild.id, message.channelId)) return false;
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
        card.card_message_id ||
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
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AddReactions,
          PermissionFlagsBits.ReadMessageHistory,
        ])
      )
        return false;
      // Recover a send that succeeded just before a crash, without posting the same card again.
      const recent = await message.channel.messages.fetch({ limit: 50 });
      const existing = recent.find(
        (m) =>
          m.author.id === message.client.user?.id &&
          m.embeds.some((e) => e.footer?.text?.startsWith(`Replay #${card.id} - `)),
      );
      const sent =
        existing ??
        (await message.channel.send({
          embeds: [replayRatingEmbed(card)],
          allowedMentions: { parse: [], repliedUser: false },
        }));
      replayRatingRepository.attachMessage(card.id, sent.id);
      await sent.react('👍').catch(() => null);
      if (activityRankRepository.getSettings(card.guild_id).ratingMode === 'both')
        await sent.react('👎').catch(() => null);
      return !existing;
    } catch (error) {
      logger.warn('Replay rating card could not be posted:', error);
      return false;
    } finally {
      this.posting.delete(key);
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
          await full.edit({ embeds: [replayRatingEmbed(card)], allowedMentions: { parse: [] } });
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

  async scan(guild: Guild): Promise<{ cards: number; checked: number }> {
    const settings = activityRankRepository.getSettings(guild.id);
    if (!this.enabled(guild.id, settings.replayChannelId))
      throw new Error('Enable GenEvo activity, replay XP and ratings first.');
    if (!replayRatingRepository.claimScan(guild.id))
      throw new Error('Wait 10 minutes before scanning again.');
    const channel = await guild.channels.fetch(settings.replayChannelId);
    if (!(channel instanceof TextChannel))
      throw new Error('Choose a server text channel for replays.');
    const messages = await channel.messages.fetch({ limit: 100 });
    let cards = 0,
      checked = 0;
    for (const message of [...messages.values()].sort(
      (a, b) => a.createdTimestamp - b.createdTimestamp,
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
        if (!isReplayAttachment(attachment, channel.id)) continue;
        checked++;
        const fingerprint = await activityRankService.downloadReplay(attachment);
        if (fingerprint && this.enabled(guild.id, channel.id)) {
          const prior = replayRatingRepository.findFingerprint(guild.id, fingerprint);
          if (
            !prior?.card_message_id &&
            !prior?.closed &&
            (await this.post(message, attachment, fingerprint))
          )
            cards++;
        }
      }
    }
    // Historical uploads get rating cards, never backdated upload XP.
    return { cards, checked };
  }
}
export const replayRatingService = new ReplayRatingService();
