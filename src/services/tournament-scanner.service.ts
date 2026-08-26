import * as cheerio from 'cheerio';
import xml2js from 'xml2js';
import { Client, TextChannel } from 'discord.js';
import { logger } from '../utils/logger';
import { tournamentRepository } from '../repositories/tournament.repository';
import { guildRepository } from '../repositories/guild.repository';
import { extractPrizeValue } from '../utils/text';
import { parsePortalDate } from '../utils/tournament-status';
import { getSortedAnnouncements, renderEventCard } from '../commands/tournaments/events.utils';
import { contentDeliveryRepository } from '../repositories/content-delivery.repository';
import { safeGetText } from '../utils/safe-fetch';
import { GameId } from '../config/games';
import { gameMapNames } from '../data/game-maps';

export { parsePortalDate } from '../utils/tournament-status';

const ESPORTS_URL = 'https://www.gamereplays.org/redalert3/portals.php?show=esports';
const GENEVO_EVENTS_FEED =
  'https://rss.moddb.com/mods/command-and-conquer-generals-evolution/articles/feed/rss.xml';
/** Forum that hosts the post-tournament "Bracket, Results and Replays" threads. */
export const RESULTS_FORUM_URL = 'https://www.gamereplays.org/community/index.php?showforum=2364';
/** Only hosts the scanner may fetch from (SSRF guard for outbound requests). */
export const ALLOWED_HOSTS = new Set(['www.gamereplays.org', 'gamereplays.org']);
const SCAN_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const RECENT_WINDOW_DAYS = 730; // ingest up to ~2 years of portal history
export interface ParsedTournament {
  title: string;
  url: string;
  dateText: string;
  excerpt: string;
}

export interface TournamentAnnouncement extends ParsedTournament {
  signUpUrl?: string;
  description: string;
}

export interface FeedTournament {
  title: string;
  url: string;
  publishedAt: string;
  description: string;
  imageUrl?: string;
}

const EVENT_WORDS =
  /\b(tournament|competition|championship|cup|league|event|sign[ -]?up|register|registration)\b/i;

function rssText(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return rssText(value[0]);
  if (typeof value === 'object') return rssText((value as { _?: unknown })._);
  return String(value).trim();
}

const ARTWORK_HOSTS = new Set([
  'www.gamereplays.org',
  'gamereplays.org',
  'media.moddb.com',
  'www.moddb.com',
  'moddb.com',
]);

function sourceImageUrl(value: string | undefined, baseUrl: string): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value, baseUrl);
    if (parsed.protocol === 'http:') parsed.protocol = 'https:';
    if (parsed.protocol !== 'https:' || !ARTWORK_HOSTS.has(parsed.hostname.toLowerCase())) {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

/** Parses official Generals Evolution articles and keeps event announcements only. */
export async function parseGenevoTournaments(xml: string): Promise<FeedTournament[]> {
  try {
    const parsed = await new xml2js.Parser({ explicitArray: false }).parseStringPromise(xml);
    let items = parsed?.rss?.channel?.item ?? [];
    if (!Array.isArray(items)) items = [items];
    return items
      .map((item: any) => {
        const html = rssText(item.description);
        const $ = cheerio.load(`<div>${html}</div>`);
        const mediaUrl =
          rssText(item?.enclosure?.$?.url) ||
          rssText(item?.['media:content']?.$?.url) ||
          rssText(item?.['media:thumbnail']?.$?.url) ||
          $('img').first().attr('src');
        const description = cheerio
          .load(`<div>${html}</div>`)('div')
          .text()
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 4000);
        return {
          title: rssText(item.title),
          url: rssText(item.link),
          publishedAt: rssText(item.pubDate) || new Date().toISOString(),
          description,
          imageUrl: sourceImageUrl(mediaUrl, rssText(item.link) || 'https://www.moddb.com/'),
        };
      })
      .filter((item: FeedTournament) => item.title && item.url)
      .filter((item: FeedTournament) => EVENT_WORDS.test(`${item.title} ${item.description}`));
  } catch {
    return [];
  }
}

/**
 * A portal article is relevant only if it is a RA3 tournament *announcement* —
 * not a mod (Generals Evolution), and not a post-tournament results/bracket
 * recap ("… Bracket, Results and Replays").
 */
const EXCLUDE_TITLE_PATTERN = /generals|bracket|results|replays|streams/i;
const GENEVO_TITLE_PATTERN = /\b(?:generals\s*(?::\s*|\s+)evolution|gen\s*evo|genevo)\b/i;

export function isTournamentRelevant(title: string): boolean {
  return !EXCLUDE_TITLE_PATTERN.test(title);
}

export function isGenevoTournamentTitle(title: string): boolean {
  return GENEVO_TITLE_PATTERN.test(title) && !/bracket|results|replays|streams/i.test(title);
}

/** Parses the GameReplays esports portal HTML into tournament announcements. */
export function parseTournaments(html: string): ParsedTournament[] {
  const $ = cheerio.load(html);
  const items: ParsedTournament[] = [];
  $('.content_list_item').each((_, el) => {
    const $item = $(el);
    const titleEl = $item.find('.content_list_title a').first();
    const title = titleEl.text().trim();
    const url = titleEl.attr('href');
    const dateText = $item.find('.content_list_infobar').first().text().trim();
    if (!title || !url) return;

    // Isolate the excerpt by dropping the title/date/type-label elements.
    const $clone = $item.clone();
    $clone.find('.content_list_title, .content_list_infobar, .content_type').remove();
    const excerpt = $clone.text().replace(/\s+/g, ' ').trim().slice(0, 300);

    items.push({ title, url, dateText, excerpt });
  });
  return items;
}

export interface ArticleActions {
  registrationUrl?: string;
  discussionUrl?: string;
  scoreUrl?: string;
}

/** Extracts registration/discussion/score topic links from article buttons. */
export function extractArticleActions(html: string): ArticleActions {
  const $ = cheerio.load(html);
  const result: ArticleActions = {};
  $('a').each((_, el) => {
    const $a = $(el);
    const text = $a.text().trim();
    const imgAlt = ($a.find('img').attr('alt') || '').trim();
    const href = $a.attr('href') || '';
    const topicId = href.match(/showtopic=(\d+)/)?.[1];
    if (!topicId) return;
    const topic = `https://www.gamereplays.org/community/index.php?showtopic=${topicId}`;
    const label = `${text} ${imgAlt}`.replace(/\s+/g, ' ').trim();
    if (!result.scoreUrl && /submit\s+(?:the\s+)?score/i.test(label)) result.scoreUrl = topic;
    if (!result.registrationUrl && /sign\s*up|register/i.test(label)) {
      result.registrationUrl = topic;
    }
    if (!result.discussionUrl && /view\s+comments|add\s+reply|discuss/i.test(label)) {
      result.discussionUrl = topic;
    }
  });
  return result;
}

/** Extracts the forum sign-up thread URL from an article page. */
export function extractSignUpUrl(html: string): string | undefined {
  return extractArticleActions(html).registrationUrl;
}

function scoreTopicUrl(actions: ArticleActions, title: string): string | undefined {
  if (actions.scoreUrl) return actions.scoreUrl;
  return /bracket|results|replays|playoffs/i.test(title) ? actions.discussionUrl : undefined;
}

/** Uses the first source-post image as the event artwork. */
export function extractArticleImage(html: string, articleUrl = ESPORTS_URL): string | undefined {
  const $ = cheerio.load(html);
  let result: string | undefined;
  $('.contentpadding img').each((_, element) => {
    if (result) return;
    const src = $(element).attr('src');
    if (/style_images|icon_|favicon|twitter|discord/i.test(src || '')) return;
    result = sourceImageUrl(src, articleUrl);
  });
  return result;
}

/** Extracts the article body (prize pool, map pool, format, …) from an article page.
 * Combined events place their map pools deep in the article, so keep the full
 * useful body while still putting a firm ceiling on stored source text. */
export function extractArticleDescription(html: string): string | undefined {
  const $ = cheerio.load(html);
  const text = $('.contentpadding').first().text().replace(/\s+/g, ' ').trim();
  return text.slice(0, 12_000) || undefined;
}

/**
 * Extracts the key tournament facts (date, prize, format, map pool) from the article
 * body so /events can show them as compact fields instead of a wall of text.
 * Only patterns that identify complete facts are accepted. Challonge supplies
 * format and prize details when an article does not contain them.
 */
export function extractEventFacts(
  description: string | undefined,
  game: GameId = 'ra3',
  referenceDate?: string,
): {
  prizePool?: string;
  format?: string;
  maps?: string;
  startDate?: string;
} {
  if (!description) return {};
  const facts: { prizePool?: string; format?: string; maps?: string; startDate?: string } = {};

  // Prize: explicit total first, then donation sums, then largest amount
  // (extractPrizeValue). Bare numbers are never prizes.
  const prizeValue = extractPrizeValue(description);
  if (prizeValue !== undefined) {
    const sponsorMatch = description.match(/\bsponsored by\s+([^.!?]{2,180})/i);
    const sponsor = sponsorMatch
      ? sponsorMatch[1]
          .replace(/\s+/g, ' ')
          .replace(/[;,\s]+$/, '')
          .trim()
      : undefined;
    facts.prizePool = sponsor
      ? `${prizeValue}$ - sponsored by ${sponsor}`.slice(0, 100)
      : `${prizeValue}$`;
  } else {
    // Sponsor without an amount is still real information.
    const sponsorOnly = description.match(/\bsponsored by\s+([^.!?]{2,180})/i);
    if (sponsorOnly) {
      facts.prizePool = `Sponsored by ${sponsorOnly[1].replace(/\s+/g, ' ').trim()}`.slice(0, 100);
    }
  }

  facts.startDate = extractEventStartDate(description, referenceDate);

  // Format: only recognized keywords, ALL of them ("Single Elimination 1v1
  // and Double elimination 2v2" → both). \b[1-4]v(?:s)?[1-4]\b can't match
  // inside "Information"; free text after the word "format" proved
  // unreliable ("Formation" → "ion is broken").
  const sizes = [
    ...new Set(
      [...description.matchAll(/\b([1-4]v(?:s)?[1-4])\b/gi)].map((m) =>
        m[1].replace(/vs/i, 'v').toUpperCase(),
      ),
    ),
  ];
  const styles = [
    ...new Set(
      [
        ...description.matchAll(
          /\b(single elimination|double elimination|round robin|swiss|best of \d)\b/gi,
        ),
      ].map((m) => m[0].toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())),
    ),
  ];
  const formatBits: string[] = [];
  if (sizes.length > 0) formatBits.push(sizes.join(' + '));
  if (styles.length > 0) formatBits.push(styles.join(' + '));
  if (formatBits.length > 0) facts.format = formatBits.join(' - ').slice(0, 100);

  // Map pool: capture everything from "map pool" up to the next labelled
  // section, then pull out the KNOWN RA3 map names it mentions. Article
  // bodies are whitespace-collapsed, so splitting on lines/commas is
  // unreliable — matching against the map allowlist is not.
  const foundMaps: string[] = [];
  for (const mapsSection of description.matchAll(
    /\bmap\s+pool\b(?:\s*(?:for\s+(?:this|the)\s+event|,\s*using\s+[^!:.]{1,80}))?\s*[:!,.-]?\s*([\s\S]{3,1500}?)(?=(?:\bprize(?:\s+pool)?\b|\bformat\b|\bdate\b|\bschedule\b|\brules?\b|\bfair\s+play\b|\bregistration\b)|$)/gi,
  )) {
    const section = mapsSection[1].toLowerCase();
    foundMaps.push(
      ...gameMapNames(game)
        .map((name) => ({ name, idx: section.indexOf(name.toLowerCase()) }))
        .filter((map) => map.idx !== -1)
        .sort((a, b) => a.idx - b.idx)
        .map((map) => map.name),
    );
  }
  if (foundMaps.length > 0) facts.maps = [...new Set(foundMaps)].join(', ').slice(0, 300);

  return facts;
}

const MONTHS: Record<string, string> = {
  january: 'Jan',
  february: 'Feb',
  march: 'Mar',
  april: 'Apr',
  may: 'May',
  june: 'Jun',
  july: 'Jul',
  august: 'Aug',
  september: 'Sep',
  october: 'Oct',
  november: 'Nov',
  december: 'Dec',
};

/** Extracts an announced event date rather than the article publication date. */
export function extractEventStartDate(
  description: string,
  referenceDate?: string,
): string | undefined {
  const referenceTimestamp = referenceDate
    ? (parsePortalDate(referenceDate) ?? Date.parse(referenceDate))
    : NaN;
  const reference = Number.isFinite(referenceTimestamp) ? new Date(referenceTimestamp) : new Date();

  const numeric = description.match(
    /\b(?:taking\s+place|takes\s+place|starts?|scheduled(?:\s+for)?|event\s+date(?:\s+is)?|beginning)\s+(?:on\s+)?(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s+(?:at\s+)?(\d{1,2}:\d{2})\s*(GMT|UTC)?)?/i,
  );
  if (numeric) {
    const monthIndex = Number(numeric[2]) - 1;
    if (monthIndex < 0 || monthIndex > 11) return undefined;
    const month = Object.values(MONTHS)[monthIndex];
    const time = numeric[4] ? `, ${numeric[4]} ${numeric[5]?.toUpperCase() || 'UTC'}` : '';
    return `${Number(numeric[1])} ${month} ${numeric[3]}${time}`;
  }

  const named = description.match(
    /\b(?:taking\s+place|takes\s+place|starts?|scheduled(?:\s+for)?|event\s+date(?:\s+is)?|beginning)\s+(?:on\s+)?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?(?:\s+(?:at\s+)?(\d{1,2}:\d{2})\s*(GMT|UTC)?)?/i,
  );
  if (!named) return undefined;
  const monthName = named[1].toLowerCase();
  const month = MONTHS[monthName];
  if (!month) return undefined;
  const monthIndex = Object.keys(MONTHS).indexOf(monthName);
  let year = named[3] ? Number(named[3]) : reference.getUTCFullYear();
  if (!named[3] && monthIndex < reference.getUTCMonth()) year++;
  const time = named[4] ? `, ${named[4]} ${named[5]?.toUpperCase() || 'UTC'}` : '';
  return `${Number(named[2])} ${month} ${year}${time}`;
}

// ── Post-tournament results threads ─────────────────────────────────────

export interface ForumTopic {
  title: string;
  url: string;
}

/** Parses an IPB forum listing into topic titles + URLs. */
export function parseForumTopics(html: string): ForumTopic[] {
  const $ = cheerio.load(html);
  const topics = new Map<string, ForumTopic>();
  const topicAnchors = $('.topic_title a[href*="showtopic="]');
  const anchors = topicAnchors.length > 0 ? topicAnchors : $('a[href*="showtopic="]');
  anchors.each((_, element) => {
    const href = $(element).attr('href') || '';
    const id = href.match(/showtopic=(\d+)/)?.[1];
    const title = $(element).text().replace(/\s+/g, ' ').trim();
    if (!id || !title || title.length < 5 || topics.has(id)) return;
    topics.set(id, {
      title,
      url: `https://www.gamereplays.org/community/index.php?showtopic=${id}`,
    });
  });
  return [...topics.values()];
}

const TITLE_STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'of',
  'for',
  'and',
  'to',
  'in',
  'on',
  'at',
  'is',
  'ra3',
  'red',
  'alert',
  'tournament',
  'tournaments',
  'event',
  'cup',
  'edition',
  'open',
  'sign',
  'up',
  'registration',
  'new',
]);

function distinctiveWords(title: string): string[] {
  return title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !TITLE_STOP_WORDS.has(w));
}

/**
 * Finds the "…Brackets, Results and Replays" thread for a tournament by
 * matching its distinctive name words against results-style topics in the
 * RA3 events forum (e.g. "Rise of the Patch" → "Rise of the Patch Bracket,
 * Results and Replays").
 */
export async function findResultsTopic(
  announcementTitle: string,
  fetcher: (url: string) => Promise<string | undefined>,
): Promise<ForumTopic | null> {
  const host = new URL(RESULTS_FORUM_URL).hostname;
  if (!ALLOWED_HOSTS.has(host)) return null; // SSRF guard, URL is a constant
  const html = await fetcher(RESULTS_FORUM_URL);
  if (!html) return null;

  const words = distinctiveWords(announcementTitle);
  if (words.length === 0) return null;

  let best: { topic: ForumTopic; score: number } | null = null;
  for (const topic of parseForumTopics(html)) {
    if (!/brackets?|results?|replays?/i.test(topic.title)) continue;
    const lower = topic.title.toLowerCase();
    const score = words.filter((w) => lower.includes(w)).length;
    if (score === words.length && (!best || topic.title.length < best.topic.title.length)) {
      best = { topic, score };
    }
  }
  return best?.topic ?? null;
}

/**
 * Scans the GameReplays RA3 eSports portal for tournament announcements and
 * posts any newly-seen tournament to each guild's configured tournament-events
 * channel with "Main Post" and "Sign Up" buttons.
 */
export class TournamentScannerService {
  private interval: NodeJS.Timeout | null = null;
  private client: Client | null = null;
  private scanning = false;

  setClient(client: Client): void {
    this.client = client;
  }

  start(): void {
    if (this.interval) return;
    this.interval = setInterval(() => {
      this.scan().catch((error) => logger.error('Tournament scan tick failed:', error));
    }, SCAN_INTERVAL_MS);
    this.interval.unref();
    logger.info('Tournament scanner started');
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async fetchHtml(url: string): Promise<string | undefined> {
    return safeGetText(url, { timeoutMs: 15_000 });
  }

  /** Scans the selected game's official source. With no argument, scans configured games. */
  async scan(game?: GameId): Promise<number> {
    if (this.scanning) return 0;
    this.scanning = true;
    try {
      let newCount = 0;
      const games = game
        ? [game]
        : [...new Set(guildRepository.getAllGuilds().map((guild) => guild.game))];
      if (games.length === 0) games.push('ra3');
      for (const selectedGame of games) {
        const added = selectedGame === 'genevo' ? await this.scanGenevo() : await this.scanRa3();
        newCount += added;
        if (added > 0) await this.announce(selectedGame);
      }
      if (newCount > 0) logger.info(`Tournament scanner: found ${newCount} new tournament(s)`);
      return newCount;
    } catch (error) {
      logger.error('Tournament scanner: scan failed:', error);
      return 0;
    } finally {
      this.scanning = false;
    }
  }

  private async scanRa3(): Promise<number> {
    const html = await this.fetchHtml(ESPORTS_URL);
    if (!html) return 0;
    const tournaments = parseTournaments(html);
    let newCount = 0;
    for (const t of tournaments) {
      if (!isTournamentRelevant(t.title)) continue;
      const dateTs = parsePortalDate(t.dateText);
      if (dateTs !== null && dateTs < Date.now() - RECENT_WINDOW_DAYS * 86_400_000) continue;

      // Enrich with the article body (description) + sign-up thread URL.
      const articleHtml = await this.fetchHtml(t.url);
      const actions = articleHtml ? extractArticleActions(articleHtml) : {};
      const signUpUrl =
        actions.registrationUrl ??
        (/registration|sign[ -]?up/i.test(t.title) ? actions.discussionUrl : undefined);
      const imageUrl = articleHtml ? extractArticleImage(articleHtml, t.url) : undefined;
      const description =
        (articleHtml ? extractArticleDescription(articleHtml) : undefined) || t.excerpt;
      const facts = extractEventFacts(description, 'ra3', t.dateText);

      const existingId = tournamentRepository.findEventIdByUrl(t.url);
      if (existingId !== undefined) {
        // Already known — refresh the sign-up URL, description and facts.
        // Facts are only rewritten when the article was actually fetched;
        // a failed fetch must not wipe existing values.
        // Never re-announce a seen tournament.
        tournamentRepository.updateEventDetails(
          t.url,
          signUpUrl ?? null,
          description,
          articleHtml ? facts : undefined,
          imageUrl,
        );
        tournamentRepository.updateEventLinks(existingId, {
          registrationUrl: signUpUrl,
          topicUrl: scoreTopicUrl(actions, t.title),
        });
        continue;
      }

      const eventId = tournamentRepository.createEvent({
        game: 'ra3',
        eventUrl: t.url,
        title: t.title,
        description,
        announcedAt: new Date().toISOString(),
        startDate: (facts.startDate ?? t.dateText) || undefined,
        imageUrl,
        signUpUrl,
        format: facts.format,
        prizePool: facts.prizePool,
        maps: facts.maps,
      });
      tournamentRepository.updateEventLinks(eventId, {
        registrationUrl: signUpUrl,
        topicUrl: scoreTopicUrl(actions, t.title),
      });
      if (signUpUrl) tournamentRepository.setEventStatus(eventId, 'registration');
      newCount++;
    }
    return newCount;
  }

  private async scanGenevo(): Promise<number> {
    const [feedCount, portalCount] = await Promise.all([
      this.scanGenevoFeed(),
      this.scanGenevoPortal(),
    ]);
    return feedCount + portalCount;
  }

  private async scanGenevoFeed(): Promise<number> {
    const xml = await this.fetchHtml(GENEVO_EVENTS_FEED);
    if (!xml) return 0;
    let newCount = 0;
    for (const item of [...(await parseGenevoTournaments(xml))].reverse()) {
      const facts = extractEventFacts(item.description, 'genevo', item.publishedAt);
      const existingId = tournamentRepository.findEventIdByUrl(item.url);
      if (existingId !== undefined) {
        tournamentRepository.updateEventDetails(
          item.url,
          item.url,
          item.description,
          facts,
          item.imageUrl,
        );
        continue;
      }
      const eventId = tournamentRepository.createEvent({
        game: 'genevo',
        eventUrl: item.url,
        title: item.title,
        description: item.description,
        announcedAt: item.publishedAt,
        startDate: facts.startDate ?? item.publishedAt,
        imageUrl: item.imageUrl,
        signUpUrl: item.url,
        format: facts.format,
        prizePool: facts.prizePool,
        maps: facts.maps,
      });
      tournamentRepository.setEventStatus(eventId, 'registration');
      newCount++;
    }
    return newCount;
  }

  private async scanGenevoPortal(): Promise<number> {
    const html = await this.fetchHtml(ESPORTS_URL);
    if (!html) return 0;
    let newCount = 0;
    for (const item of parseTournaments(html)) {
      if (!isGenevoTournamentTitle(item.title)) continue;
      const published = parsePortalDate(item.dateText);
      if (published !== null && published < Date.now() - RECENT_WINDOW_DAYS * 86_400_000) continue;

      const articleHtml = await this.fetchHtml(item.url);
      const actions = articleHtml ? extractArticleActions(articleHtml) : {};
      const signUpUrl =
        actions.registrationUrl ??
        (/registration|sign[ -]?up/i.test(item.title) ? actions.discussionUrl : undefined);
      const imageUrl = articleHtml ? extractArticleImage(articleHtml, item.url) : undefined;
      const description =
        (articleHtml ? extractArticleDescription(articleHtml) : undefined) || item.excerpt;
      const facts = extractEventFacts(description, 'genevo', item.dateText);

      const existingId = tournamentRepository.findEventIdByUrl(item.url);
      if (existingId !== undefined) {
        tournamentRepository.updateEventDetails(
          item.url,
          signUpUrl ?? null,
          description,
          articleHtml ? facts : undefined,
          imageUrl,
        );
        tournamentRepository.updateEventLinks(existingId, {
          registrationUrl: signUpUrl,
          topicUrl: scoreTopicUrl(actions, item.title),
        });
        continue;
      }

      const eventId = tournamentRepository.createEvent({
        game: 'genevo',
        eventUrl: item.url,
        title: item.title,
        description,
        announcedAt: new Date().toISOString(),
        startDate: (facts.startDate ?? item.dateText) || undefined,
        imageUrl,
        signUpUrl,
        format: facts.format,
        prizePool: facts.prizePool,
        maps: facts.maps,
      });
      tournamentRepository.updateEventLinks(eventId, {
        registrationUrl: signUpUrl,
        topicUrl: scoreTopicUrl(actions, item.title),
      });
      if (signUpUrl) tournamentRepository.setEventStatus(eventId, 'registration');
      newCount++;
    }
    return newCount;
  }

  /**
   * Posts a single interactive event browser (newest tournament + Prev/Next,
   * Sign Up/Results buttons) to each guild's configured tournament channel.
   */
  private async announce(game: GameId): Promise<void> {
    const announcements = getSortedAnnouncements(game);
    if (announcements.length === 0) return;
    await this.announceEvent(announcements[0].id);
  }

  /**
   * Posts one specific event card (Sign Up / Results button, NO navigation —
   * channel posts read like news) to every guild's tournament channel. Used
   * for new announcements and freshly discovered brackets.
   */
  async announceEvent(eventId: number): Promise<void> {
    const eventGame = tournamentRepository.getEventDetail(eventId)?.game;
    if (!eventGame) return;
    for (const guildData of guildRepository.getAllGuilds()) {
      if (guildData.game !== eventGame) continue;
      await this.announceEventToGuild(guildData.discordId, eventId);
    }
  }

  async announceEventToGuild(guildId: string, eventId: number): Promise<boolean> {
    const itemKey = String(eventId);
    const guildData = guildRepository.findByDiscordId(guildId);
    if (!guildData?.tournamentEventsChannelId || guildData.tournamentsEnabled === 0) return false;
    if (tournamentRepository.getEventDetail(eventId)?.game !== guildData.game) return false;
    const rendered = renderEventCard(eventId);
    if (!rendered) return false;
    const guild = this.client?.guilds.cache.get(guildId);
    const channel = guild?.channels.cache.get(guildData.tournamentEventsChannelId);
    if (!(channel instanceof TextChannel)) return false;
    if (contentDeliveryRepository.wasDelivered(guildId, 'tournament', itemKey, channel.id))
      return false;
    try {
      await channel.send(rendered);
      contentDeliveryRepository.markDelivered(guildId, 'tournament', itemKey, channel.id);
      return true;
    } catch (error) {
      logger.warn(`Tournament scanner: failed to announce to guild ${guildId}:`, error);
      return false;
    }
  }

  async postLatestToGuild(guildId: string): Promise<boolean> {
    const game = guildRepository.findByDiscordId(guildId)?.game ?? 'ra3';
    const latest = getSortedAnnouncements(game)[0];
    return latest ? this.announceEventToGuild(guildId, latest.id) : false;
  }
}

export const tournamentScanner = new TournamentScannerService();
