import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { youTubeService } from './youtube.service';
import { trackedStreamerRepository } from '../repositories/tracked-streamer.repository';
import { guildRepository } from '../repositories/guild.repository';
import { db } from '../database/sqlite';
import axios from 'axios';
import xml2js from 'xml2js';

export class YouTubeNotifierService {
  private callbackUrl: string | null = null;
  private renewInterval: NodeJS.Timeout | null = null;
  private pollInterval: NodeJS.Timeout | null = null;
  private client: Client | null = null;
  private renewing = false;
  /** Polling mode kicks in when no reachable public callback URL is set. */
  private readonly POLL_INTERVAL_MS = 15 * 60 * 1000;
  private readonly POLL_MAX_AGE_MS = 24 * 60 * 60 * 1000;
  /**
   * Community channels tracked for EVERY guild, by channel id. Sybert's
   * BattleCast channel: https://www.youtube.com/@OneSybert
   */
  private readonly DEFAULT_CHANNEL_IDS = ['UCPgGuw7BZ6_SzDmsEG40uGQ'];
  /** Channel id → display name, learned from the RSS feeds. */
  private channelNames = new Map<string, string>();

  setCallbackUrl(url: string): void {
    this.callbackUrl = url;
  }

  setClient(client: Client): void {
    this.client = client;
  }

  /** Placeholder values can never receive PubSubHubbub pushes. */
  private hasReachableCallback(): boolean {
    return !!this.callbackUrl && !/yourdomain|localhost|example\.com/i.test(this.callbackUrl);
  }

  async start(): Promise<void> {
    if (!this.hasReachableCallback()) {
      logger.info(
        'YouTube: no public callback URL - using polling mode for tracked channels',
      );
      await this.pollAll();
      this.pollInterval = setInterval(() => {
        this.pollAll().catch((error) => logger.error('YouTube poll tick failed:', error));
      }, this.POLL_INTERVAL_MS);
      this.pollInterval.unref();
      return;
    }
    if (!this.callbackUrl) {
      logger.warn('YouTube callback URL not set, notifier disabled');
      return;
    }
    logger.info('YouTube notifier started');
    await this.renewAllSubscriptions();
    this.renewInterval = setInterval(
      () => {
        this.renewAllSubscriptions().catch((error) =>
          logger.error('YouTube subscription renewal failed:', error),
        );
      },
      3 * 24 * 60 * 60 * 1000,
    );
    this.renewInterval.unref();
  }

  stop(): void {
    if (this.renewInterval) {
      clearInterval(this.renewInterval);
      this.renewInterval = null;
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /** Latest uploads of a channel via its free RSS feed (no API key needed). */
  private async fetchFeedUploads(
    channelId: string,
  ): Promise<Array<{ videoId: string; title: string; publishedAt?: string; channelTitle?: string }>> {
    if (!/^[\w-]{5,50}$/.test(channelId)) return [];
    const res = await axios.get('https://www.youtube.com/feeds/videos.xml', {
      params: { channel_id: channelId },
      timeout: 10000,
    });
    const result = await new xml2js.Parser({ explicitArray: false }).parseStringPromise(res.data);
    const feed = result?.feed ?? {};
    if (feed.title && typeof feed.title === 'string') this.channelNames.set(channelId, feed.title);
    let entries = feed.entry ?? [];
    if (!Array.isArray(entries)) entries = [entries];
    return entries
      .map((e: any) => ({
        videoId: String(e['yt:videoId'] || ''),
        title: String(e.title || '').slice(0, 500),
        publishedAt: e.published ? String(e.published) : undefined,
        channelTitle: feed.author?.name ? String(feed.author.name) : undefined,
      }))
      .filter((e: any) => e.videoId);
  }

  /** Polling fallback: check tracked channels' uploads and post fresh videos. */
  private async pollAll(): Promise<void> {
    if (!this.client) return;
    const tracked = trackedStreamerRepository
      .findAll()
      .filter((s) => s.platform === 'youtube' && !this.DEFAULT_CHANNEL_IDS.includes(s.platformId));
    const channels = [
      ...tracked.map((s) => ({ id: s.platformId, isDefault: false })),
      ...this.DEFAULT_CHANNEL_IDS.map((id) => ({ id, isDefault: true })),
    ];
    if (channels.length === 0) {
      logger.debug('YouTube polling: no tracked channels yet');
      return;
    }
    for (const streamer of channels) {
      try {
        const uploads = await this.fetchFeedUploads(streamer.id);
        for (const video of uploads) {
          if (!video.publishedAt) continue;
          if (Date.now() - new Date(video.publishedAt).getTime() > this.POLL_MAX_AGE_MS) continue;
          await this.handleNotification(streamer.id, video.videoId, video.title, true, streamer.isDefault);
        }
      } catch (error) {
        logger.warn(`YouTube poll failed for channel ${streamer.id}:`, error);
      }
    }
  }

  async subscribeChannel(channelId: string): Promise<boolean> {
    if (!this.callbackUrl) return false;
    // Fail closed — without a verify token the webhook server rejects all
    // verification callbacks, so a subscription can never be confirmed.
    if (!env.YOUTUBE_VERIFY_TOKEN) {
      logger.error('YOUTUBE_VERIFY_TOKEN not configured - cannot subscribe to YouTube channels');
      return false;
    }
    const hubUrl = youTubeService.getPubSubHubUrl();
    const topic = youTubeService.getFeedUrl(channelId);

    try {
      const params: Record<string, string | number> = {
        'hub.mode': 'subscribe',
        'hub.topic': topic,
        'hub.callback': `${this.callbackUrl}/youtube/callback`,
        'hub.verify': 'async',
        'hub.verify_token': env.YOUTUBE_VERIFY_TOKEN,
        'hub.lease_seconds': 864000,
      };
      // Send hub.secret so PubSubHubbub signs pushes with X-Hub-Signature.
      if (env.YOUTUBE_CALLBACK_SECRET) params['hub.secret'] = env.YOUTUBE_CALLBACK_SECRET;
      await axios.post(hubUrl, null, { params, timeout: 15_000 });
      logger.info(`Subscribed to YouTube channel ${channelId}`);
      return true;
    } catch (error) {
      logger.error(`YouTube subscription failed for ${channelId}:`, error);
      return false;
    }
  }

  async unsubscribeChannel(channelId: string): Promise<boolean> {
    if (!this.callbackUrl) return false;
    if (!env.YOUTUBE_VERIFY_TOKEN) return false;
    const hubUrl = youTubeService.getPubSubHubUrl();
    const topic = youTubeService.getFeedUrl(channelId);

    try {
      await axios.post(hubUrl, null, {
        params: {
          'hub.mode': 'unsubscribe',
          'hub.topic': topic,
          'hub.callback': `${this.callbackUrl}/youtube/callback`,
          'hub.verify_token': env.YOUTUBE_VERIFY_TOKEN,
        },
      });
      logger.info(`Unsubscribed from YouTube channel ${channelId}`);
      return true;
    } catch (error) {
      logger.error(`YouTube unsubscription failed for ${channelId}:`, error);
      return false;
    }
  }

  private async renewAllSubscriptions(): Promise<void> {
    if (this.renewing) return;
    this.renewing = true;
    try {
      const allStreamers = trackedStreamerRepository.findAll();
      const youtubeStreamers = allStreamers.filter(
        (s) => s.platform === 'youtube' && !this.DEFAULT_CHANNEL_IDS.includes(s.platformId),
      );
      for (const streamer of youtubeStreamers) {
        await this.subscribeChannel(streamer.platformId);
      }
      for (const id of this.DEFAULT_CHANNEL_IDS) {
        await this.subscribeChannel(id);
      }
    } finally {
      this.renewing = false;
    }
  }

  /** DB-backed dedup: PubSubHubbub retries must never double-notify a guild. */
  private wasNotified(videoId: string): boolean {
    return !!db.prepare('SELECT 1 FROM youtube_notified_videos WHERE video_id = ?').get(videoId);
  }

  private markNotified(videoId: string): void {
    db.prepare('INSERT OR IGNORE INTO youtube_notified_videos (video_id) VALUES (?)').run(videoId);
  }

  async handleNotification(
    channelId: string,
    videoId: string,
    title: string,
    isLive: boolean,
    isDefaultChannel = false,
  ): Promise<void> {
    if (!isLive) return;
    if (this.wasNotified(videoId)) return;

    const trackings = trackedStreamerRepository.findByPlatformId(channelId);
    // Default channels (Sybert) post to every guild with YouTube enabled;
    // guild-tracked channels only to the guilds that track them.
    const targetGuildIds = isDefaultChannel
      ? guildRepository.getAllGuilds().map((g) => g.discordId)
      : trackings.map((t) => t.guildId);
    if (targetGuildIds.length === 0) return;

    this.markNotified(videoId);

    // Channel name from the feed (no API); thumbnails are public CDN URLs.
    const channelName = this.channelNames.get(channelId) || 'YouTube Channel';
    const embed = new EmbedBuilder()
      .setTitle(`📺 New video: ${title}`)
      .setURL(`https://youtu.be/${videoId}`)
      .setColor(0xff0000)
      .setAuthor({ name: channelName, iconURL: 'https://www.youtube.com/favicon.ico' })
      .setThumbnail(`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`)
      .setTimestamp();

    for (const guildId of targetGuildIds) {
      const guild = this.client?.guilds.cache.get(guildId);
      if (!guild) continue;
      const guildData = guildRepository.findByDiscordId(guild.id);
      if (!guildData?.youtubeChannelId) continue;
      if (!guildData.youtubeNotifierEnabled) continue;

      const channel = guild.channels.cache.get(guildData.youtubeChannelId) as TextChannel;
      if (!channel) continue;

      await channel
        .send({ embeds: [embed] })
        .catch((e) => logger.warn(`YouTube send failed: ${e.message}`));
    }
  }
}

export const youTubeNotifier = new YouTubeNotifierService();
