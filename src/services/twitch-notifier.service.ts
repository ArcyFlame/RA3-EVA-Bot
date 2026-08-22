import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import { logger } from '../utils/logger';
import { sanitizeInput } from '../utils/sanitize';
import { twitchService, TwitchStream } from './twitch.service';
import { trackedStreamerRepository } from '../repositories/tracked-streamer.repository';
import { guildRepository } from '../repositories/guild.repository';
import { db } from '../database/sqlite';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const RE_NOTIFY_AFTER_MS = 6 * 60 * 60 * 1000; // 6 hours

export class TwitchNotifierService {
  private pollInterval: NodeJS.Timeout | null = null;
  private gameId: string | null = null;
  private polling = false;

  async start(client: Client): Promise<void> {
    logger.info('Starting Twitch notifier...');

    this.gameId = await twitchService.getRA3GameId();
    if (!this.gameId) {
      logger.error('Could not resolve RA3 game ID - Twitch polling disabled');
      return;
    }

    logger.info(`Twitch notifier started, game ID: ${this.gameId}`);

    await this.poll(client);
    this.pollInterval = setInterval(() => {
      this.poll(client).catch((error) => logger.error('Twitch poll tick failed:', error));
    }, POLL_INTERVAL_MS);
    this.pollInterval.unref();
  }

  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    logger.info('Twitch notifier stopped');
  }

  private async poll(client: Client): Promise<void> {
    // Overlap guard: a slow tick must never stack concurrent polls.
    if (this.polling) {
      logger.warn('Previous Twitch poll still running - skipping tick');
      return;
    }
    this.polling = true;
    try {
      if (!this.gameId) {
        logger.warn('No game ID available, skipping poll');
        return;
      }

      logger.debug(`Polling Twitch for RA3 streams (game ID: ${this.gameId})...`);
      const streams = await twitchService.getStreamsByGame(this.gameId);
      logger.info(`Found ${streams.length} RA3 stream(s)`);

      for (const stream of streams) {
        try {
          await this.handleStream(client, stream);
        } catch (error) {
          // One malformed stream must not abort the rest of the batch.
          logger.error(`Failed to process stream from ${stream?.userName ?? 'unknown'}:`, error);
        }
      }
    } catch (error) {
      logger.error('Twitch polling error:', error);
    } finally {
      this.polling = false;
    }
  }

  /** DB-backed dedup (twitch_notified_streams) — survives restarts. */
  private wasNotifiedRecently(userId: string): boolean {
    const row = db
      .prepare('SELECT notified_at FROM twitch_notified_streams WHERE broadcaster_id = ?')
      .get(userId) as { notified_at: string } | undefined;
    if (!row) return false;
    const notifiedAt = new Date(row.notified_at.replace(' ', 'T') + 'Z').getTime();
    return Date.now() - notifiedAt < RE_NOTIFY_AFTER_MS;
  }

  private markNotified(userId: string): void {
    db.prepare(
      `INSERT INTO twitch_notified_streams (broadcaster_id, notified_at) VALUES (?, CURRENT_TIMESTAMP)
       ON CONFLICT(broadcaster_id) DO UPDATE SET notified_at = CURRENT_TIMESTAMP`,
    ).run(userId);
  }

  private async handleStream(client: Client, stream: TwitchStream): Promise<void> {
    if (this.wasNotifiedRecently(stream.userId)) {
      logger.debug(`Streamer ${stream.userName} already notified recently, skipping`);
      return;
    }

    this.markNotified(stream.userId);

    let profileImageUrl: string | null = null;
    try {
      const userInfo = await twitchService.getUserByLogin(stream.userName);
      profileImageUrl = userInfo?.profileImageUrl || null;
    } catch (error) {
      logger.warn(`Failed to fetch user info for ${stream.userName}:`, error);
    }

    const embed = new EmbedBuilder()
      .setTitle((stream.title || `${stream.userName} is live!`).slice(0, 256))
      .setDescription(`🔴 **LIVE NOW** on Twitch\nhttps://twitch.tv/${stream.userName}`)
      .setColor(0x9146ff)
      .setTimestamp()
      .setAuthor({
        name: stream.userName,
        iconURL: 'https://static.twitchcdn.net/assets/favicon-32-e29e246c157142c94346.png',
      })
      .addFields(
        { name: '🎮 Game', value: (stream.gameName || 'Unknown').slice(0, 1024), inline: true },
        { name: '👀 Viewers', value: String(stream.viewerCount ?? 0), inline: true },
      );

    if (stream.thumbnailUrl) {
      embed.setImage(stream.thumbnailUrl.replace('{width}', '1280').replace('{height}', '720'));
    }
    if (profileImageUrl) {
      embed.setThumbnail(profileImageUrl);
    }

    // Tracked streamers add per-guild custom messages; every other RA3 stream
    // is still announced to every guild with a Twitch channel configured —
    // requiring every streamer to be tracked first meant nothing ever posted.
    const trackings = trackedStreamerRepository.findByPlatformId(stream.userId);
    const targets: Array<{ guildId: string; customMessage?: string }> = trackings.length
      ? trackings.map((t) => ({ guildId: t.guildId, customMessage: t.customMessage }))
      : guildRepository
          .getAllGuilds()
          .filter((g) => g.twitchChannelId && g.twitchNotifierEnabled === 1)
          .map((g) => ({ guildId: g.discordId }));

    for (const target of targets) {
      const guild = client.guilds.cache.get(target.guildId);
      if (!guild) continue;

      const guildData = guildRepository.findByDiscordId(guild.id);
      if (!guildData?.twitchChannelId || !guildData.twitchNotifierEnabled) continue;

      const channel = guild.channels.cache.get(guildData.twitchChannelId);
      if (!channel || !(channel instanceof TextChannel)) {
        logger.warn(`Twitch channel ${guildData.twitchChannelId} not found in guild ${guild.name}`);
        continue;
      }

      // Sanitize admin-configured custom messages — no @everyone surprises.
      const content = target.customMessage
        ? sanitizeInput(target.customMessage, 500)
        : undefined;
      try {
        await channel.send({ content, embeds: [embed] });
        logger.info(`✅ Sent Twitch notification to ${guild.name} / #${channel.name}`);
      } catch (error) {
        logger.error(`Failed to send Twitch notification to ${guild.name}:`, error);
      }
    }
  }

  /** Manual on-demand live check. */
  async checkStreamer(userId: string): Promise<TwitchStream | null> {
    try {
      return await twitchService.getStreamByUserId(userId);
    } catch (error) {
      logger.error(`Failed to check streamer ${userId}:`, error);
      return null;
    }
  }

  /**
   * Admin test: posts a real live RA3 stream (or a synthetic test embed when
   * nobody is live) to every guild with a Twitch channel — proves the pipe.
   */
  async postTest(client: Client): Promise<number> {
    const streams = await twitchService.getStreamsByGame(this.gameId ?? '').catch(() => []);
    if (streams.length > 0) {
      await this.handleStream(client, streams[0]);
      return 1;
    }
    const embed = new EmbedBuilder()
      .setTitle('🧪 Twitch notifier test')
      .setDescription(
        'The Twitch pipeline works. No RA3 stream is live right now, so this is a synthetic post. Real streams post automatically.',
      )
      .setColor(0x9146ff)
      .setTimestamp();
    let posted = 0;
    for (const g of guildRepository.getAllGuilds()) {
      if (!g.twitchChannelId || g.twitchNotifierEnabled !== 1) continue;
      const guild = client.guilds.cache.get(g.discordId);
      const channel = guild?.channels.cache.get(g.twitchChannelId);
      if (channel instanceof TextChannel) {
        await channel.send({ embeds: [embed] }).then(() => posted++).catch(() => null);
      }
    }
    return posted;
  }
}

export const twitchNotifier = new TwitchNotifierService();
