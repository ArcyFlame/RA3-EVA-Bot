import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import axios from 'axios';
import xml2js from 'xml2js';
import { logger } from '../utils/logger';
import { guildRepository } from '../repositories/guild.repository';
import { db } from '../database/sqlite';

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

    // Rate limit: max one post per window, newest item only. Unposted items
    // stay unmarked and surface on a later poll instead of flooding.
    const sinceLast = Date.now() - this.lastPostedAt;
    if (sinceLast < this.minPostIntervalMs) {
      logger.debug(
        `ModDB RSS: ${candidates.length} new item(s) waiting (rate limited, next post in ${Math.round((this.minPostIntervalMs - sinceLast) / 60000)} min)`,
      );
      return;
    }
    const newest = candidates[0];
    await this.sendNotification(newest.item, newest.feedUrl);
    await this.markNotified(newest.item.guid);
    this.lastPostedAt = Date.now();
    logger.info(`ModDB RSS: posted 1 new RA3 item (${candidates.length - 1} queued for later polls)`);
  }

  /** Newest RA3 articles/news/mods for the /mods command (no dedup logic). */
  async fetchLatestRa3Items(limit = 10): Promise<RSSItem[]> {
    const items: RSSItem[] = [];
    const seen = new Set<string>();
    for (const feedUrl of this.rssFeeds) {
      try {
        for (const item of await this.fetchFeed(feedUrl)) {
          if (!this.isRA3Related(item)) continue;
          if (seen.has(item.guid)) continue;
          seen.add(item.guid);
          items.push(item);
        }
      } catch {
        // try the next feed
      }
    }
    items.sort((a, b) => {
      const ta = new Date(a.pubDate).getTime() || 0;
      const tb = new Date(b.pubDate).getTime() || 0;
      return tb - ta;
    });
    return items.slice(0, limit);
  }

  /** Admin test: posts the newest RA3 item to every configured guild (no dedup marking). */
  async postTest(): Promise<number> {
    let posted = 0;
    for (const feedUrl of this.rssFeeds) {
      try {
        const items = await this.fetchFeed(feedUrl);
        const ra3 = items.find((i) => this.isRA3Related(i));
        if (!ra3) continue;
        await this.sendNotification(ra3, feedUrl);
        posted++;
        break;
      } catch {
        // try the next feed
      }
    }
    return posted;
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
    const response = await axios.get(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'application/rss+xml,application/xml,text/xml',
      },
      timeout: 15000,
    });

    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(response.data);

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

  private async sendNotification(item: RSSItem, feedUrl: string): Promise<void> {
    const type = this.detectType(feedUrl, item);
    const embed = new EmbedBuilder()
      .setTitle(`${this.getTypeEmoji(type)} ${this.formatTypeName(type)}: ${item.title}`)
      .setURL(item.link)
      .setDescription(this.truncate(item.description || 'Click to view on ModDB', 300))
      .setColor(this.getTypeColor(type))
      .setAuthor({ name: 'ModDB', iconURL: 'https://www.moddb.com/favicon.ico' })
      .setTimestamp(new Date(item.pubDate))
      .setFooter({ text: 'ModDB RSS • New content' });

    const guilds = guildRepository.getAllGuilds();
    for (const guildData of guilds) {
      if (!guildData.moddbNotifierEnabled) continue;
      if (!guildData.moddbChannelId) continue;
      const guild = this.client?.guilds.cache.get(guildData.discordId);
      if (!guild) continue;
      const channel = guild.channels.cache.get(guildData.moddbChannelId) as TextChannel;
      if (!channel) continue;

      try {
        await channel.send({ embeds: [embed] });
      } catch (error) {
        logger.warn(`Failed to send ModDB notification to guild ${guildData.discordId}:`, error);
      }
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
