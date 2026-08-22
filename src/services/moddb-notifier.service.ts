import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import xml2js from 'xml2js';
import * as cheerio from 'cheerio';
import { logger } from '../utils/logger';
import { guildRepository } from '../repositories/guild.repository';
import { db } from '../database/sqlite';
import { contentDeliveryRepository } from '../repositories/content-delivery.repository';
import { safeGetText } from '../utils/safe-fetch';

interface RSSItem {
  title: string;
  link: string;
  pubDate: string;
  description?: string;
  guid: string;
  category?: string;
}

export class ModDBNotifierService {
  private pollInterval: NodeJS.Timeout | null = null;
  private client: Client | null = null;
  /**
   * RA3 mod coverage only: articles + news (+ mods/addons). The downloads
   * and site-wide global feeds flooded channels with maps and other games'
   * content — those are gone. See https://www.moddb.com/games/cc-red-alert-3/articles.
   */
  private readonly rssFeeds = [
    'https://rss.moddb.com/games/cc-red-alert-3/articles/feed/rss.xml',
    'https://rss.moddb.com/games/cc-red-alert-3/news/feed/rss.xml',
    'https://rss.moddb.com/games/cc-red-alert-3/addons/feed/rss.xml',
  ];
  private readonly pollIntervalMinutes = 15;
  /** At most one channel post per 6 hours — ModDB bursts must not spam. */
  private readonly minPostIntervalMs = 6 * 60 * 60 * 1000;
  private lastPostedAt = 0;
  private polling = false;

  setClient(client: Client): void {
    this.client = client;
  }

  async start(): Promise<void> {
    logger.info(`ModDB RSS notifier starting with ${this.rssFeeds.length} feeds...`);
    this.pollInterval = setInterval(
      () => {
        this.poll().catch((error) => logger.error('ModDB poll tick failed:', error));
      },
      this.pollIntervalMinutes * 60 * 1000,
    );
    this.pollInterval.unref();
    await this.poll();
  }

  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    logger.info('ModDB RSS notifier stopped');
  }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      await this.pollFeeds();
    } finally {
      this.polling = false;
    }
  }

  private async pollFeeds(): Promise<void> {
    logger.debug('Polling ModDB RSS feeds...');
    const candidates: Array<{ item: RSSItem; feedUrl: string }> = [];
    const seen = new Set<string>();
    // First run (empty dedup table): ingest the feed history silently and
    // present only the newest item — channels then only ever see genuinely
    // NEW content instead of a backlog.
    const wasEmpty = !db.prepare('SELECT 1 FROM moddb_notified LIMIT 1').get();

    for (const feedUrl of this.rssFeeds) {
      try {
        const items = await this.fetchFeed(feedUrl);
        for (const item of items) {
          if (!this.isRA3Related(item)) continue;
          if (seen.has(item.guid)) continue;
          seen.add(item.guid);
          if (await this.isAlreadyNotified(item.guid)) continue;
          candidates.push({ item, feedUrl });
        }
        // Small delay between feeds to avoid rate limiting
        await this.delay(1000);
      } catch (error) {
        logger.error(`Failed to process feed ${feedUrl}:`, error);
      }
    }

    if (candidates.length === 0) return;

    candidates.sort((a, b) => {
      const ta = new Date(a.item.pubDate).getTime() || 0;
      const tb = new Date(b.item.pubDate).getTime() || 0;
      return tb - ta;
    });

    if (wasEmpty) {
      // Fresh install: post the newest item, mark the rest as seen.
      const newest = candidates[0];
      await this.sendNotification(newest.item, newest.feedUrl);
      for (const c of candidates) await this.markNotified(c.item.guid);
      this.lastPostedAt = Date.now();
      logger.info(`ModDB RSS: first run - posted the newest item, ${candidates.length - 1} older item(s) marked seen`);
      return;
    }

    // Rate limit: max one post per window, newest item only.
    const sinceLast = Date.now() - this.lastPostedAt;
    if (sinceLast < this.minPostIntervalMs) {
      logger.debug(
        `ModDB RSS: ${candidates.length} new item(s) waiting (rate limited, next post in ${Math.round((this.minPostIntervalMs - sinceLast) / 60000)} min)`,
      );
      return;
    }
    const newest = candidates[0];
    await this.sendNotification(newest.item, newest.feedUrl);
    for (const candidate of candidates) await this.markNotified(candidate.item.guid);
    this.lastPostedAt = Date.now();
    logger.info(`ModDB RSS: posted the newest RA3 item; ${candidates.length - 1} older item(s) marked seen`);
  }

  private async fetchLatestCandidates(): Promise<Array<{ item: RSSItem; feedUrl: string }>> {
    const candidates: Array<{ item: RSSItem; feedUrl: string }> = [];
    const seen = new Set<string>();
    for (const feedUrl of this.rssFeeds) {
      try {
        for (const item of await this.fetchFeed(feedUrl)) {
          if (!this.isRA3Related(item) || seen.has(item.guid)) continue;
          seen.add(item.guid);
          candidates.push({ item, feedUrl });
        }
      } catch {
        // A failed feed must not hide valid items from the others.
      }
    }
    return candidates.sort((a, b) => {
      const ta = new Date(a.item.pubDate).getTime() || 0;
      const tb = new Date(b.item.pubDate).getTime() || 0;
      return tb - ta;
    });
  }

  /** Newest RA3 articles/news/mods for the /mods command (no dedup logic). */
  async fetchLatestRa3Items(limit = 10): Promise<RSSItem[]> {
    return (await this.fetchLatestCandidates()).slice(0, limit).map(({ item }) => item);
  }

  async postLatestToGuild(guildId: string): Promise<boolean> {
    const latest = (await this.fetchLatestCandidates())[0];
    return latest ? this.sendNotificationToGuild(latest.item, latest.feedUrl, guildId) : false;
  }

  /** Admin test: posts the newest RA3 item to every configured guild (no dedup marking). */
  async postTest(): Promise<number> {
    const latest = (await this.fetchLatestCandidates())[0];
    if (!latest) return 0;
    await this.sendNotification(latest.item, latest.feedUrl);
    return 1;
  }

  /** xml2js can hand back guid/link as arrays or {_ : text} objects — flatten to a string. */
  private static flattenRssValue(value: unknown): string {
    if (value == null) return '';
    if (Array.isArray(value)) return ModDBNotifierService.flattenRssValue(value[0]);
    if (typeof value === 'object') {
      const obj = value as { _?: unknown };
      return ModDBNotifierService.flattenRssValue(obj._);
    }
    return String(value);
  }

  private async fetchFeed(url: string): Promise<RSSItem[]> {
    const xml = await safeGetText(url, { timeoutMs: 15_000 });
    if (!xml) return [];
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(xml);

    if (!result.rss?.channel?.item) return [];

    let items = result.rss.channel.item;
    if (!Array.isArray(items)) items = [items];

    return items.map((item: any) => ({
      title: ModDBNotifierService.flattenRssValue(item.title) || 'Untitled',
      link: ModDBNotifierService.flattenRssValue(item.link),
      pubDate: ModDBNotifierService.flattenRssValue(item.pubDate) || new Date().toISOString(),
      description: ModDBNotifierService.flattenRssValue(item.description),
      guid:
        ModDBNotifierService.flattenRssValue(item.guid) ||
        ModDBNotifierService.flattenRssValue(item.link) ||
        `ra3:${ModDBNotifierService.flattenRssValue(item.title)}`,
      category: item.category,
    }));
  }

  private isRA3Related(item: RSSItem): boolean {
    const lowerTitle = item.title.toLowerCase();
    const lowerLink = item.link.toLowerCase();
    const lowerDesc = (item.description || '').toLowerCase();

    const ra3Keywords = [
      'red alert 3',
      'ra3',
      'command & conquer: red alert 3',
      'command and conquer: red alert 3',
      'c&c: red alert 3',
      'cc red alert 3',
    ];

    const hasKeyword = ra3Keywords.some(
      (keyword) =>
        lowerTitle.includes(keyword) || lowerLink.includes(keyword) || lowerDesc.includes(keyword),
    );

    const isInRa3Section = lowerLink.includes('/cc-red-alert-3/');

    return hasKeyword || isInRa3Section;
  }

  private async isAlreadyNotified(guid: string): Promise<boolean> {
    if (!guid) return true; // no stable id → never post rather than crash
    return !!db.prepare('SELECT 1 FROM moddb_notified WHERE url = ?').get(guid);
  }

  private async markNotified(guid: string): Promise<void> {
    try {
      db.prepare('INSERT OR IGNORE INTO moddb_notified (url, content_type) VALUES (?, ?)').run(
        guid,
        'rss',
      );
    } catch (error) {
      logger.warn('Failed to mark notified in DB:', error);
    }
  }

  private cleanDescription(value: string | undefined): string {
    if (!value) return 'Open the post on ModDB for screenshots, downloads and full details.';
    const text = cheerio.load(`<div>${value}</div>`)('div').text();
    const cleaned = text
      .replace(/\b(?:read|view) more\b.*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    return this.truncate(cleaned || 'Open the post on ModDB for full details.', 300);
  }

  private buildEmbed(item: RSSItem, feedUrl: string): EmbedBuilder {
    const type = this.detectType(feedUrl, item);
    const embed = new EmbedBuilder()
      .setTitle(`${this.getTypeEmoji(type)} ${this.formatTypeName(type)}: ${item.title}`)
      .setURL(item.link)
      .setDescription(this.cleanDescription(item.description))
      .setColor(this.getTypeColor(type))
      .setAuthor({ name: 'ModDB', iconURL: 'https://www.moddb.com/favicon.ico' })
      .setFooter({ text: 'ModDB RSS • New content' });
    const timestamp = new Date(item.pubDate);
    if (!Number.isNaN(timestamp.getTime())) embed.setTimestamp(timestamp);
    return embed;
  }

  private async sendNotificationToGuild(
    item: RSSItem,
    feedUrl: string,
    guildId: string,
  ): Promise<boolean> {
    const guildData = guildRepository.findByDiscordId(guildId);
    if (!guildData?.moddbNotifierEnabled || !guildData.moddbChannelId) return false;
    const guild = this.client?.guilds.cache.get(guildId);
    const channel = guild?.channels.cache.get(guildData.moddbChannelId);
    if (!(channel instanceof TextChannel)) return false;
    if (contentDeliveryRepository.wasDelivered(guildId, 'moddb', item.guid, channel.id)) return false;
    try {
      await channel.send({ embeds: [this.buildEmbed(item, feedUrl)] });
      contentDeliveryRepository.markDelivered(guildId, 'moddb', item.guid, channel.id);
      return true;
    } catch (error) {
      logger.warn(`Failed to send ModDB notification to guild ${guildId}:`, error);
      return false;
    }
  }

  private async sendNotification(item: RSSItem, feedUrl: string): Promise<void> {

    const guilds = guildRepository.getAllGuilds();
    for (const guildData of guilds) {
      await this.sendNotificationToGuild(item, feedUrl, guildData.discordId);
    }
  }

  private detectType(feedUrl: string, _item: RSSItem): string {
    if (feedUrl.includes('/addons/')) return 'mod';
    if (feedUrl.includes('/articles/')) return 'article';
    if (feedUrl.includes('/news/')) return 'news';
    if (feedUrl.includes('/features/')) return 'feature';
    if (feedUrl.includes('/downloads/')) return 'download';
    if (feedUrl.includes('/tutorials/')) return 'tutorial';
    if (feedUrl.includes('/videos/')) return 'video';
    if (feedUrl.includes('/images/')) return 'image';
    if (feedUrl.includes('/audio/')) return 'audio';
    if (feedUrl.includes('/headlines/')) return 'headline';
    if (feedUrl.includes('/blogs/')) return 'blog';
    if (feedUrl.includes('/polls/')) return 'poll';
    if (feedUrl.includes('/groups/')) return 'group';
    return 'update';
  }

  private formatTypeName(type: string): string {
    const map: Record<string, string> = {
      mod: 'New Mod',
      article: 'New Article',
      news: 'News',
      feature: 'Feature',
      download: 'Download',
      tutorial: 'Tutorial',
      video: 'Video',
      image: 'Image',
      audio: 'Audio',
      headline: 'Headline',
      blog: 'Blog Post',
      poll: 'Poll',
      group: 'Group News',
      update: 'Update',
    };
    return map[type] || 'Update';
  }

  private getTypeEmoji(type: string): string {
    const map: Record<string, string> = {
      mod: '📦',
      article: '📰',
      news: '📢',
      feature: '✨',
      download: '⬇️',
      tutorial: '🎓',
      video: '🎬',
      image: '🖼️',
      audio: '🎵',
      headline: '📰',
      blog: '📝',
      poll: '📊',
      group: '👥',
      update: '🔔',
    };
    return map[type] || '🔔';
  }

  private getTypeColor(type: string): number {
    const map: Record<string, number> = {
      mod: 0x00a6ff,
      article: 0xff6600,
      news: 0x1e90ff,
      feature: 0xda70d6,
      download: 0x32cd32,
      tutorial: 0xffa500,
      video: 0xff0000,
      image: 0x9932cc,
      audio: 0xff69b4,
      headline: 0x708090,
      blog: 0x8b4513,
      poll: 0x4169e1,
      group: 0x228b22,
      update: 0x5865f2,
    };
    return map[type] || 0x5865f2;
  }

  private truncate(text: string, maxLength: number): string {
    if (!text) return 'Click to view on ModDB';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const moddbNotifier = new ModDBNotifierService();
