import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import xml2js from 'xml2js';
import * as cheerio from 'cheerio';
import { logger } from '../utils/logger';
import { newsRepository } from '../repositories/news.repository';
import { guildRepository } from '../repositories/guild.repository';
import { safeGetText } from '../utils/safe-fetch';
import { contentDeliveryRepository } from '../repositories/content-delivery.repository';
import { GameId, GAME_CONFIGS } from '../config/games';

const RA3_PORTAL_URL = 'https://www.gamereplays.org/redalert3/';
export const RA3_NEWS_URL = 'https://www.gamereplays.org/redalert3/portals.php?show=news_index';

const GAME_NEWS_FEEDS: Partial<Record<GameId, { url: string; filter?: RegExp }>> = {
  genevo: {
    url: 'https://rss.moddb.com/mods/command-and-conquer-generals-evolution/articles/feed/rss.xml',
  },
};

const SCAN_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export interface ParsedNews {
  title: string;
  url: string;
  excerpt: string;
  imageUrl?: string;
}

function rssText(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return rssText(value[0]);
  if (typeof value === 'object') return rssText((value as { _?: unknown })._);
  return String(value).trim();
}

function safeImageUrl(value: string | undefined, baseUrl: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, baseUrl);
    if (url.protocol === 'http:') url.protocol = 'https:';
    if (url.protocol !== 'https:') return undefined;
    if (!/(?:^|\.)(?:gamereplays\.org|moddb\.com)$/.test(url.hostname.toLowerCase())) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function absolutePortalUrl(href: string): string {
  try {
    const parsed = new URL(href, RA3_PORTAL_URL);
    if (parsed.hostname.endsWith('gamereplays.org')) parsed.protocol = 'https:';
    return parsed.toString();
  } catch {
    return '';
  }
}

/** Parses the current RA3 portal cards (newest first). */
export function parseRa3PortalNews(html: string): ParsedNews[] {
  const $ = cheerio.load(html);
  const items: ParsedNews[] = [];
  const seen = new Set<string>();

  $('.content_list_item').each((_, element) => {
    const card = $(element);
    const type = card.find('.content_type').first().text().replace(/\s+/g, ' ').trim();
    if (!/^news$/i.test(type)) return;

    const link = card.find('.content_list_title a').first();
    const title = link.text().replace(/\s+/g, ' ').trim();
    const url = absolutePortalUrl(link.attr('href') || '');
    if (!title || !url || seen.has(url)) return;

    const copy = card.clone();
    copy
      .find(
        '.content_list_title, .content_list_infobar, .content_type, .portal_news_preview_footer, script, style',
      )
      .remove();
    const excerpt = copy.text().replace(/\s+/g, ' ').trim().slice(0, 300);
    const thumbnailStyle = card.find('.content_list_thumbnail').first().attr('style') || '';
    const imageUrl = safeImageUrl(
      thumbnailStyle.match(/url\((['"]?)(.*?)\1\)/i)?.[2],
      RA3_PORTAL_URL,
    );
    items.push({ title, url, excerpt, imageUrl });
    seen.add(url);
  });

  return items;
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
    .map((item: any) => {
      const url = rssText(item.link);
      const description = rssText(item.description);
      const $ = cheerio.load(`<div>${description}</div>`);
      const image =
        rssText(item?.['media:content']?.$?.url) ||
        rssText(item?.['media:thumbnail']?.$?.url) ||
        rssText(item?.enclosure?.$?.url) ||
        $('img').first().attr('src');
      return {
        title: rssText(item.title),
        url,
        excerpt: $('div').text().replace(/\s+/g, ' ').trim().slice(0, 300),
        imageUrl: safeImageUrl(image, url || 'https://www.moddb.com/'),
      };
    })
    .filter((item: ParsedNews) => item.title && item.url)
    .filter((item: ParsedNews) => (filter ? filter.test(`${item.title} ${item.excerpt}`) : true));
}

async function fetchGameItems(game: GameId): Promise<ParsedNews[]> {
  if (game === 'ra3') {
    const html = await safeGetText(RA3_NEWS_URL);
    return html ? parseRa3PortalNews(html) : [];
  }
  const feed = GAME_NEWS_FEEDS[game];
  return feed ? fetchFeedItems(feed.url, feed.filter) : [];
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
      const games = new Set(guildRepository.getAllGuilds().map((g) => g.game ?? 'ra3'));
      if (games.size === 0) games.add('ra3');

      let newCount = 0;
      for (const game of games) {
        const fresh: ParsedNews[] = [];
        const items = await fetchGameItems(game);
        // Sources are newest-first. Insert oldest-first so the newest item has
        // the highest local id and /news opens on it.
        for (const item of [...items].reverse()) {
          const existed = newsRepository.hasNewsUrl(item.url, game);
          newsRepository.create({
            game,
            newsUrl: item.url,
            title: item.title,
            excerpt: item.excerpt,
            imageUrl: item.imageUrl,
          });
          if (existed) continue;
          fresh.push(item);
          newCount++;
        }
        // A source change or a long outage can produce a backlog. Store the
        // archive, but announce only the newest item so channels never flood.
        const newest = fresh[fresh.length - 1];
        if (newest) await this.announceItem(newest, game);
      }
      if (newCount > 0) {
        logger.info(`News scanner: ${newCount} new item(s)`);
      }
      return newCount;
    } catch (error) {
      logger.warn('News scanner: fetch failed:', error);
      return 0;
    } finally {
      this.scanning = false;
    }
  }

  private buildEmbed(
    latest: { title: string; newsUrl?: string; url: string; excerpt?: string; imageUrl?: string },
    game: GameId,
  ): EmbedBuilder {
    const link = latest.newsUrl || latest.url;
    const config = GAME_CONFIGS[game];
    const embed = new EmbedBuilder()
      .setTitle(`📰 ${latest.title}`)
      .setURL(link)
      .setColor(config.color)
      .setThumbnail(config.artworkUrl)
      .setDescription(latest.excerpt?.slice(0, 300) || `New ${config.shortLabel} news.`);
    if (latest.imageUrl) embed.setImage(latest.imageUrl);
    return embed;
  }

  private async announceItemToGuild(
    guildId: string,
    latest: { title: string; newsUrl?: string; url: string; excerpt?: string; imageUrl?: string },
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
      await channel.send({ embeds: [this.buildEmbed(latest, guildData.game)] });
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
    let latest:
      | { title: string; newsUrl?: string; url: string; excerpt?: string; imageUrl?: string }
      | undefined;
    latest = (await fetchGameItems(guildData?.game ?? 'ra3').catch(() => []))[0];
    if (!latest) {
      const stored = newsRepository.getLatest(1, guildData?.game ?? 'ra3')[0];
      if (stored) latest = { ...stored, url: stored.newsUrl };
    }
    return latest ? this.announceItemToGuild(guildId, latest) : false;
  }

  /** Posts one news item to every guild with a bound news channel. */
  private async announceItem(
    latest: { title: string; newsUrl?: string; url: string; excerpt?: string; imageUrl?: string },
    game: GameId,
  ): Promise<void> {
    if (!(latest.newsUrl || latest.url)) return;

    for (const guildData of guildRepository.getAllGuilds()) {
      if ((guildData.game ?? 'ra3') !== game) continue;
      await this.announceItemToGuild(guildData.discordId, latest);
    }
  }
}

export const newsScanner = new NewsScannerService();
