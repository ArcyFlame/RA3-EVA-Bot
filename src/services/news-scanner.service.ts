import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import xml2js from 'xml2js';
import { logger } from '../utils/logger';
import { newsRepository } from '../repositories/news.repository';
import { guildRepository } from '../repositories/guild.repository';
import { safeGetText } from '../utils/safe-fetch';
import { contentDeliveryRepository } from '../repositories/content-delivery.repository';

/**
 * GameReplays publishes per-game news RSS feeds — the RA3-only feed (id=35)
 * is what /news shows, so items about other C&C games never appear.
 * Feeds per configured server game; GenEvo has no dedicated feed yet, so it
 * reads the site-wide feed filtered to GenEvo keywords.
 */
const GAME_NEWS_FEEDS: Record<string, { url: string; filter?: RegExp }> = {
  ra3: { url: 'https://www.gamereplays.org/community/index.php?act=rssout&id=35' },
  kw: { url: 'https://www.gamereplays.org/community/index.php?act=rssout&id=32' },
  genevo: {
    url: 'https://www.gamereplays.org/community/index.php?act=rssout&id=1',
    filter: /generals evolution|genevo|gen evo/i,
  },
};

const SCAN_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export interface ParsedNews {
  title: string;
  url: string;
  excerpt: string;
}

async function fetchFeedItems(url: string, filter?: RegExp): Promise<ParsedNews[]> {
  const xml = await safeGetText(url);
  if (!xml) return [];
  const parser = new xml2js.Parser({ explicitArray: false });
  let result: any;
  try {
    result = await parser.parseStringPromise(xml);
  } catch {
    return [];
  }
  let items = result?.rss?.channel?.item ?? [];
  if (!Array.isArray(items)) items = [items];
  return items
    .map((item: any) => ({
      title: String(item.title || '').trim(),
      url: String(item.link || '').trim(),
      excerpt: String(item.description || '').replace(/<[^>]+>/g, '').trim().slice(0, 300),
    }))
    .filter((item: ParsedNews) => item.title && item.url)
    .filter((item: ParsedNews) => (filter ? filter.test(`${item.title} ${item.excerpt}`) : true));
}

/**
 * Scans the game's news feed and posts newly-seen items to each guild's
 * configured news channel (guilds on other games keep their own feed).
 */
export class NewsScannerService {
  private interval: NodeJS.Timeout | null = null;
  private client: Client | null = null;
  private scanning = false;

  setClient(client: Client): void {
    this.client = client;
  }

  start(): void {
    if (this.interval) return;
    this.interval = setInterval(() => {
      this.scan().catch((error) => logger.error('News scan tick failed:', error));
    }, SCAN_INTERVAL_MS);
    this.interval.unref();
    logger.info('News scanner started');
  }

  async scan(): Promise<number> {
    if (this.scanning) return 0;
    this.scanning = true;
    try {
      // Union of feeds for the games any guild actually uses.
      const games = new Set(
        guildRepository.getAllGuilds().map((g) => g.game ?? 'ra3'),
      );
      if (games.size === 0) games.add('ra3');

      // First run (empty table): ingest the feed history WITHOUT flooding the
      // channels — only the single newest item gets posted, everything after
      // is genuinely new.
      const wasEmpty = !newsRepository.getLatest(1)[0];

      let newCount = 0;
      const fresh: ParsedNews[] = [];
      for (const game of games) {
        const feed = GAME_NEWS_FEEDS[game];
        if (!feed) continue;
        const items = await fetchFeedItems(feed.url, feed.filter);
        for (const item of items) {
          if (newsRepository.hasNewsUrl(item.url)) continue;
          newsRepository.create({ newsUrl: item.url, title: item.title, excerpt: item.excerpt });
          fresh.push(item);
          newCount++;
        }
      }
      if (newCount > 0) {
        logger.info(`News scanner: ${newCount} new item(s)`);
        if (wasEmpty) {
          // Fresh install: present the latest item once.
          await this.announceItem(fresh[0]);
        } else {
          // Post EVERY new item, oldest first so the channel ends on the
          // newest (dedup table guarantees each is posted exactly once).
          for (const item of fresh.reverse()) {
            await this.announceItem(item);
          }
        }
      }
      return newCount;
    } catch (error) {
      logger.warn('News scanner: fetch failed:', error);
      return 0;
    } finally {
      this.scanning = false;
    }
  }

  private buildEmbed(latest: { title: string; newsUrl?: string; url: string; excerpt?: string }): EmbedBuilder {
    const link = latest.newsUrl || latest.url;
    return new EmbedBuilder()
      .setTitle(`📰 ${latest.title}`)
      .setURL(link)
      .setColor(0x5865f2)
      .setDescription(latest.excerpt?.slice(0, 300) || 'New Red Alert 3 news.');
  }

  private async announceItemToGuild(
    guildId: string,
    latest: { title: string; newsUrl?: string; url: string; excerpt?: string },
  ): Promise<boolean> {
    const link = latest.newsUrl || latest.url;
    if (!link) return false;
    const guildData = guildRepository.findByDiscordId(guildId);
    if (guildData?.newsEnabled === 0 || !guildData?.newsChannelId) return false;
    const guild = this.client?.guilds.cache.get(guildId);
    const channel = guild?.channels.cache.get(guildData.newsChannelId);
    if (!(channel instanceof TextChannel)) return false;
    if (contentDeliveryRepository.wasDelivered(guildId, 'news', link, channel.id)) return false;

    try {
      await channel.send({ embeds: [this.buildEmbed(latest)] });
      contentDeliveryRepository.markDelivered(guildId, 'news', link, channel.id);
      return true;
    } catch (error) {
      logger.warn(`News scanner: failed to post to guild ${guildId}:`, error);
      return false;
    }
  }

  /** Posts the newest relevant item to one server, used for a newly selected empty channel. */
  async postLatestToGuild(guildId: string): Promise<boolean> {
    const guildData = guildRepository.findByDiscordId(guildId);
    const feed = GAME_NEWS_FEEDS[guildData?.game ?? 'ra3'];
    let latest: { title: string; newsUrl?: string; url: string; excerpt?: string } | undefined;
    if (feed) latest = (await fetchFeedItems(feed.url, feed.filter).catch(() => []))[0];
    if (!latest) {
      const stored = newsRepository.getLatest(1)[0];
      if (stored) latest = { ...stored, url: stored.newsUrl };
    }
    return latest ? this.announceItemToGuild(guildId, latest) : false;
  }

  /** Posts one news item to every guild with a bound news channel. */
  private async announceItem(latest: { title: string; newsUrl?: string; url: string; excerpt?: string }): Promise<void> {
    if (!(latest.newsUrl || latest.url)) return;

    for (const guildData of guildRepository.getAllGuilds()) {
      await this.announceItemToGuild(guildData.discordId, latest);
    }
  }
}

export const newsScanner = new NewsScannerService();
