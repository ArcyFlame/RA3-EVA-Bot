import {
  Attachment,
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

const day = () => new Date().toISOString().slice(0, 10);
export function replayRatingEmbed(card: ReplayRatingCard): EmbedBuilder {
  const counts = replayRatingRepository.totals(card.id);
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
        value: `👍 **${counts.up}**   👎 **${counts.down}**`,
        inline: true,
      },
      { name: 'Rating Bonus', value: `**${card.bonus_awarded} XP** earned`, inline: true },
    )
    .setFooter({
      text: `Replay #${card.id} - One vote per member; your latest vote counts. No self-votes. XP is capped.`,
    });
}

export class ReplayRatingService {
  private posting = new Set<string>();
  private queues = new Map<number, Promise<void>>();
  private queued = 0;
  private refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();

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
    const vote = reaction.emoji.name === '👍' ? 1 : reaction.emoji.name === '👎' ? -1 : 0;
    if (!vote || user.bot || this.queued >= 200) return;
    const card = replayRatingRepository.findMessage(reaction.message.id);
    if (
      !card ||
      card.closed ||
      card.user_id === user.id ||
      !this.enabled(card.guild_id, card.channel_id)
    )
      return;
    if (
      reaction.message.guildId !== card.guild_id ||
      reaction.message.channelId !== card.channel_id
    )
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
        .then((full) =>
          full.edit({ embeds: [replayRatingEmbed(card)], allowedMentions: { parse: [] } }),
        )
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
