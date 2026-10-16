import {
  Attachment,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Client,
  ContainerBuilder,
  FileBuilder,
  TextDisplayBuilder,
  MessageFlags,
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
import { replayMedal } from '../utils/replay-medals';

const day = () => new Date().toISOString().slice(0, 10);
export function replayRatingPayload(card: ReplayRatingCard, filename = card.filename) {
  const counts = replayRatingRepository.totals(card.id);
  const settings = activityRankRepository.getSettings(card.guild_id);
  const both = settings.ratingMode === 'both';
  const medal = replayMedal(Math.max(0, counts.up - (both ? counts.down : 0)), card.guild_id);
  const container = new ContainerBuilder()
    .setAccentColor(0xd6ad43)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${medal || '🎬 Generals Evolution Replay'}\nUploaded by <@${card.user_id}>` +
          (card.description ? '\n' + escapeMarkdown(card.description) : ''),
      ),
    )
    .addFileComponents(new FileBuilder().setURL(`attachment://${filename}`))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**Community Rating:** 👍 ${counts.up}` +
          (both ? `   👎 ${counts.down}` : '') +
          `\n**Rating Bonus:** ${card.bonus_awarded} XP earned\n` +
          `${settings.ratingPoints} XP per qualifying like, starting at ${settings.ratingMinVotes} ${both ? 'net votes' : 'likes'}.`,
      ),
    )
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Replay #${card.id}`));
  return {
    flags: MessageFlags.IsComponentsV2 as const,
    embeds: [],
    components: [container, ...replayRatingControls(card)],
    ...(card.archive_attachment_id
      ? { attachments: [{ id: card.archive_attachment_id, filename }] }
      : {}),
    allowedMentions: { parse: [] as [], repliedUser: false },
  };
}

/** Discord exposes V2 files inside components instead of the message attachments array. */
export function replayArchives(message: Message): Array<{ id: string; name: string }> {
  const files = [...message.attachments.values()].map((file) => ({ id: file.id, name: file.name }));
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    const node = value as {
      type?: number;
      name?: string;
      file?: { attachment_id?: string; url?: string };
      components?: unknown[];
    };
    if (node.type === 13 && node.name && node.file?.attachment_id && node.file.url) {
      try {
        const url = new URL(node.file.url);
        if (
          url.protocol === 'https:' &&
          ['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname) &&
          url.pathname.startsWith(`/attachments/${message.channelId}/${node.file.attachment_id}/`)
        )
          files.push({ id: node.file.attachment_id, name: node.name });
      } catch {
        /* An unresolved or invalid file must never authorize deleting the original. */
      }
    }
    node.components?.forEach(visit);
  };
  message.components?.forEach((component) => visit(component.toJSON()));
  return files;
}

function hasReplayControl(value: unknown, id: number): boolean {
  if (!value || typeof value !== 'object') return false;
  const node = value as { custom_id?: string; components?: unknown[] };
  return (
    node.custom_id === `replay_vote:up:${id}` ||
    !!node.components?.some((child) => hasReplayControl(child, id))
  );
}

export function replayRatingControls(card: ReplayRatingCard) {
  const counts = replayRatingRepository.totals(card.id);
  const votes = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`replay_vote:up:${card.id}`)
      .setEmoji('👍')
      .setLabel(String(counts.up))
      .setStyle(ButtonStyle.Primary),
  );
  if (activityRankRepository.getSettings(card.guild_id).ratingMode === 'both')
    votes.addComponents(
      new ButtonBuilder()
        .setCustomId(`replay_vote:down:${card.id}`)
        .setEmoji('👎')
        .setLabel(String(counts.down))
        .setStyle(ButtonStyle.Secondary),
    );
  votes.addComponents(
    new ButtonBuilder()
      .setCustomId(`replay_options:${card.id}`)
      .setLabel('Replay Options')
      .setStyle(ButtonStyle.Secondary),
  );
  return [votes];
}

export class ReplayRatingService {
  private posting = new Set<string>();
  private queues = new Map<number, Promise<void>>();
  private queued = 0;
  private refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();

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
      if (
        existing &&
        replayArchives(existing).some((file) => file.id === card.archive_attachment_id)
      ) {
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
            (m.embeds.some((e) => e.footer?.text?.startsWith(`Replay #${card.id} - `)) ||
              m.components?.some((component) => hasReplayControl(component.toJSON(), card.id))),
        ) ?? null;
      const sent =
        existing ??
        (await message.channel.send({
          ...replayRatingPayload(card),
          files: [{ attachment: file.bytes, name: card.filename }],
        }));
      replayRatingRepository.attachMessage(card.id, sent.id);
      if (!replayArchives(sent).length) {
        const archived = await sent.edit({
          files: [{ attachment: file.bytes, name: card.filename }],
        });
        const copy = replayArchives(archived).find((file) => file.name === card.filename);
        if (!copy) return false;
        replayRatingRepository.archive(card.id, copy.id, message.content ?? '');
      } else {
        const copy = replayArchives(sent).find((a) => a.name === card.filename);
        if (!copy) return false;
        replayRatingRepository.archive(card.id, copy.id, message.content ?? '');
      }
      const updated = replayRatingRepository.get(card.id)!;
      await sent.edit({ ...replayRatingPayload(updated), content: null });
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
        !replayArchives(copy).some((file) => file.id === card.archive_attachment_id)
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
    // Votes now belong to buttons. Removing legacy reactions must not erase the vote ledger.
    if (remove) return;
    const card = replayRatingRepository.findMessage(reaction.message.id);
    if (!card || card.closed || !this.enabled(card.guild_id, card.channel_id)) return;
    if (
      reaction.message.guildId !== card.guild_id ||
      reaction.message.channelId !== card.channel_id
    )
      return;
    await reaction.users.remove(user.id).catch(() => {
      logger.debug('Replay reaction cleanup needs Manage Messages in the replay channel.');
    });
  }

  async handleVote(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    const match = /^replay_vote:(up|down):(\d+)$/.exec(interaction.customId);
    const card = match ? replayRatingRepository.get(Number(match[2])) : undefined;
    const valid = () =>
      card &&
      replayRatingRepository.get(card.id)?.closed === 0 &&
      (replayRatingRepository.get(card.id)?.revision ?? 0) === (card.revision ?? 0) &&
      card.guild_id === interaction.guildId &&
      card.channel_id === interaction.channelId &&
      card.card_message_id === interaction.message.id &&
      interaction.message.author.id === interaction.client.user.id &&
      this.enabled(card.guild_id, card.channel_id);
    if (!card || !valid() || !interaction.guild || interaction.user.bot) {
      await interaction.editReply('This replay vote is no longer available.');
      return;
    }
    if (card.user_id === interaction.user.id) {
      await interaction.editReply('You cannot vote for your own replay. No vote or XP was added.');
      return;
    }
    if (this.queued >= 200) {
      await interaction.editReply('Voting is busy. Please try again shortly.');
      return;
    }
    const vote = match![1] === 'up' ? 1 : -1;
    this.queued++;
    const previous = this.queues.get(card.id) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        const guild = interaction.guild!;
        const member = await guild.members
          .fetch({ user: interaction.user.id, force: true })
          .catch(() => null);
        const settings = activityRankRepository.getSettings(guild.id);
        if (!valid()) {
          await interaction.editReply(
            'This replay changed or voting is unavailable. Open the current card and try again.',
          );
          return;
        }
        const remove = replayRatingRepository.getVote(card.id, interaction.user.id) === vote;
        if (
          !valid() ||
          (vote === -1 && settings.ratingMode !== 'both') ||
          !member ||
          member.user.bot ||
          (!remove &&
            (Date.now() - member.user.createdTimestamp < settings.ratingAccountDays * 86400000 ||
              !member.joinedTimestamp ||
              Date.now() - member.joinedTimestamp < 86400000))
        ) {
          await interaction.editReply(
            `Voting requires a ${settings.ratingAccountDays}-day-old account and at least 24 hours in this server. The replay and voting must also remain enabled.`,
          );
          return;
        }
        if (!remove) {
          const reason = replayRatingRepository.claimVoteAction(
            guild.id,
            interaction.user.id,
            card.user_id,
            card.id,
          );
          if (reason) {
            await interaction.editReply(reason);
            return;
          }
        }
        const points = replayRatingRepository.vote(
          card.id,
          interaction.user.id,
          vote,
          remove,
          day(),
        );
        this.refresh(interaction.message, card.id);
        await interaction.editReply(
          remove
            ? 'Your vote was removed.'
            : points
              ? `Vote saved. The uploader earned ${points} XP.`
              : `Vote saved. XP starts at ${settings.ratingMinVotes} ${settings.ratingMode === 'both' ? 'net votes' : 'likes'}; daily/replay caps and previously rewarded votes also apply.`,
        );
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
        return interaction
          .editReply('The vote could not be completed. Please check the card and try again.')
          .then(() => undefined)
          .catch(() => undefined);
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
      void message
        .fetch()
        .then(async (full) => {
          const card = replayRatingRepository.get(cardId);
          if (!card || card.closed || !this.enabled(card.guild_id, card.channel_id)) return;
          const archived = replayArchives(full).find(
            (file) => file.id === card.archive_attachment_id,
          );
          if (!archived) return;
          await full.edit({ ...replayRatingPayload(card, archived.name), content: null });
          if (full.reactions.cache.size)
            await full.reactions.removeAll().catch(() => {
              logger.debug('Replay reaction cleanup needs Manage Messages in the replay channel.');
            });
        })
        .catch((error) => logger.debug('Replay card refresh could not complete:', error));
    }, 2000);
    timer.unref();
    this.refreshTimers.set(message.id, timer);
  }

  async clear(message: Message, vote?: -1 | 1): Promise<void> {
    // Reaction removal is independent from button votes, including during card migration.
    void message;
    void vote;
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
