import * as cheerio from 'cheerio';
import { logger } from '../utils/logger';
import { safeGetText } from '../utils/safe-fetch';
import { tournamentRepository } from '../repositories/tournament.repository';
import {
  extractArticleImage,
  isTournamentRelevant,
  tournamentScanner,
} from './tournament-scanner.service';
import { challongeService } from './challonge.service';
import { isKnownSkirmishMap } from './ra3-stats.service';
import { extractPrizeValue, truncateSentences } from '../utils/text';
import { statusFromChallonge } from '../utils/tournament-status';
import { checkinNotificationService } from './checkin-notification.service';
import { GameId } from '../config/games';

export { truncateSentences };

/**
 * Scrapes the shared GameReplays tournament forum (showforum=2364) for Red
 * Alert 3 and Generals Evolution registration/results topics, then links them
 * to the correct game event by normalized name.
 */

const FORUM_URL = 'https://www.gamereplays.org/community/index.php?showforum=2364';
const SCAN_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 hours
const FORUM_PAGE_SIZE = 25;
const RECENT_FORUM_PAGES = 3;
/** Sign-up threads paginate 20 posts per page; three pages cover any thread. */
const REGISTRATION_PAGES = [0, 20, 40];
const NON_RA3_TOURNAMENT = /generals evolution|genevo|gen evo|tiberi\w*|c&c ?3|zero hour/i;

export interface ForumTopic {
  title: string;
  url: string;
  kind: 'registration' | 'results' | 'other';
}

/** Strips suffix decorations so topic families share a base name. Edition
 *  numbers are KEPT: "FTW 91" and "FTW #88" are different tournaments. */
export function baseName(title: string): string {
  return title
    .toLowerCase()
    .replace(
      /\b(?:brackets?|results?|replays?|streams?|registrations?|check[- ]?ins?|prizes?|pools?|and|for|sign[- ]?ups?|tournaments?|events?|announcements?|playoffs?)\b/g,
      ' ',
    )
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactTournamentName(title: string): string {
  return baseName(title)
    .replace(/(\d)vs(\d)/g, '$1v$2')
    .replace(/\s+/g, '');
}

/** Matches forum/portal title variants without merging numbered editions. */
export function tournamentNamesMatch(topicTitle: string, eventTitle: string): boolean {
  if (!editionsCompatible(topicTitle, eventTitle)) return false;
  const topic = compactTournamentName(topicTitle);
  const event = compactTournamentName(eventTitle);
  if (!topic || !event) return false;
  if (topic === event) return true;
  const [shorter, longer] = topic.length <= event.length ? [topic, event] : [event, topic];
  return shorter.length >= 6 && longer.startsWith(shorter);
}

export function classifyTopic(title: string): ForumTopic['kind'] {
  const lower = title.toLowerCase();
  if (/registration|sign[- ]?up/.test(lower)) return 'registration';
  if (/(bracket|results|replays|streams)/.test(lower)) return 'results';
  return 'other';
}

/** Edition numbers in a title ("FTW 91", "XMAS2025") — prize amounts ignored. */
function editionNumbers(title: string): number[] {
  const cleaned = title.replace(/[$€£]\s?\d+/gi, ' ');
  return [...cleaned.matchAll(/\d{1,4}/g)].map((m) => parseInt(m[0], 10));
}

/** Edition guard: FTW-style series reuse one name for many editions. */
export function editionsCompatible(topicTitle: string, eventTitle: string): boolean {
  const t = editionNumbers(topicTitle);
  const e = editionNumbers(eventTitle);
  if (t.length === 0 || e.length === 0) return true;
  return t.some((n) => e.includes(n));
}

/** Canonical https topic URL from any href variant (?s=0&showtopic=N&view=…). */
export function canonicalTopicUrl(href: string): string | undefined {
  const m = href.match(/showtopic=(\d+)/);
  if (!m) return undefined;
  return `https://www.gamereplays.org/community/index.php?showtopic=${m[1]}`;
}

/** Parses the forum topic list into {title, url, kind} (verified selectors). */
export function parseForumTopics(html: string): ForumTopic[] {
  const $ = cheerio.load(html);
  const topics: ForumTopic[] = [];
  const seen = new Set<string>();
  const topicAnchors = $('.topic_title a[href*="showtopic="]');
  const anchors = topicAnchors.length > 0 ? topicAnchors : $('a[href*="showtopic="]');
  anchors.each((_, el) => {
    const href = $(el).attr('href') || '';
    if (!href.includes('showtopic=')) return;
    const title = $(el).text().replace(/\s+/g, ' ').trim();
    if (!title || title.length < 6) return;
    const url = canonicalTopicUrl(href);
    if (!url || seen.has(url)) return;
    seen.add(url);
    const kind = classifyTopic(title);
    if (kind === 'other') return;
    topics.push({ title, url, kind });
  });
  return topics;
}

export interface TopicLinks {
  challonge: string[];
  checkins?: string;
  registration?: string;
  resultPage?: string;
  mapLines: string[];
  bodyText: string;
}

/** Extracts the interesting links from a topic page (first post area). */
export function parseTopicPage(html: string): TopicLinks {
  const $ = cheerio.load(html);
  const links: TopicLinks = { challonge: [], mapLines: [], bodyText: '' };

  const addChallongeLink = (value: string) => {
    const directUrl = value.match(
      /(?:https?:\/\/)?(?:www\.)?(?:[a-z0-9-]+\.)?challonge\.com\/(?:[a-z]{2}(?:_[a-z]{2})?\/)?[a-z0-9][a-z0-9-]{0,60}/i,
    )?.[0];
    if (!directUrl) return;
    const normalized = (
      /^https?:\/\//i.test(directUrl) ? directUrl : `https://${directUrl}`
    ).replace(/^http:\/\//i, 'https://');
    if (!challongeService.parseTournamentRef(normalized)) return;
    if (!links.challonge.includes(normalized)) links.challonge.push(normalized);
  };

  $('a').each((_, el) => {
    const href = ($(el).attr('href') || '').trim();
    const lower = href.toLowerCase();
    if (lower.includes('challonge.com')) {
      addChallongeLink(href);
    }
    const text = $(el).text().toLowerCase();
    if (text.includes('check') && href.includes('showtopic=')) {
      links.checkins = canonicalTopicUrl(href);
    }
    if (text.includes('registration') && href.includes('showtopic=')) {
      links.registration = canonicalTopicUrl(href);
    }
    if (
      /bracket|results?|streams?/i.test(text) &&
      /gamereplays\.org\/redalert3\/portals\.php/i.test(href) &&
      /show=page/i.test(href)
    ) {
      try {
        const resultPage = new URL(href, 'https://www.gamereplays.org/');
        resultPage.protocol = 'https:';
        links.resultPage = resultPage.toString();
      } catch {
        // Ignore malformed source links.
      }
    }
  });

  // Some old forum posts contain broken BBCode such as
  // "[url=https://challonge.com/example[/url]". It is visible in the page
  // source but never becomes an anchor, so scan the source for direct links.
  for (const match of html.matchAll(
    /(?:https?:\/\/)?(?:www\.)?(?:[a-z0-9-]+\.)?challonge\.com\/(?:[a-z]{2}(?:_[a-z]{2})?\/)?[a-z0-9][a-z0-9-]{0,60}/gi,
  )) {
    addChallongeLink(match[0]);
  }

  links.bodyText = $.text().replace(/\r/g, '');
  return links;
}

export interface ForumReportedMatch {
  player1: string;
  player1Score: number;
  player2: string;
  player2Score: number;
  winner: string;
}

function cleanForumPlayer(value: string, author: string): string {
  const clean = value
    .replace(/^[\s:–—-]+|[\s:–—-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return /^(?:me|myself)$/i.test(clean) ? author : clean;
}

/** Extracts the human-written score line at the start of each results reply. */
export function parseForumMatchResults(html: string): ForumReportedMatch[] {
  const $ = cheerio.load(html);
  const results: ForumReportedMatch[] = [];
  const seen = new Set<string>();
  $('.comment_wrapper')
    .slice(1)
    .each((_, post) => {
      const author = $(post).find('.member_name a').first().text().replace(/\s+/g, ' ').trim();
      const liveBody = $(post).find('.comment_display_content').first();
      const body = liveBody.length > 0 ? liveBody : $(post).find('.comment').first();
      if (!author || body.length === 0) return;
      const copy = body.clone();
      copy.find('script, style, img').remove();
      copy.find('br').replaceWith('\n');
      const text = copy
        .text()
        .replace(/\u00a0/g, ' ')
        .split(/Attached File|Size:|Player Name/i)[0]
        .replace(/[ \t]+/g, ' ')
        .trim()
        .slice(0, 300);

      let player1 = '';
      let player2 = '';
      let player1Score = 0;
      let player2Score = 0;
      const direct = text.match(
        /^([^\n]{1,40}?)\s+(\d{1,2})\s*[-–]\s*(\d{1,2})\s+([^\n]{1,40}?)(?:\n|$)/i,
      );
      const trailingScore = text.match(
        /^([^\n]{1,40}?)\s+(\d{1,2})\s*[-–]\s*([^\n]{1,40}?)\s+(\d{1,2})(?:\n|$)/i,
      );
      const versus = text.match(
        /^(\d{1,2})\s*[-–]\s*(\d{1,2})\s+(?:vs\.?\s+)?([^\n]{1,40}?)(?:\n|$)/i,
      );
      if (direct) {
        player1 = cleanForumPlayer(direct[1], author);
        player1Score = Number(direct[2]);
        player2Score = Number(direct[3]);
        player2 = cleanForumPlayer(direct[4], author);
      } else if (trailingScore) {
        player1 = cleanForumPlayer(trailingScore[1], author);
        player1Score = Number(trailingScore[2]);
        player2 = cleanForumPlayer(trailingScore[3], author);
        player2Score = Number(trailingScore[4]);
      } else if (versus) {
        player1 = author;
        player1Score = Number(versus[1]);
        player2Score = Number(versus[2]);
        player2 = cleanForumPlayer(versus[3], author);
      } else {
        return;
      }
      if (!player1 || !player2 || player1.length > 40 || player2.length > 40) return;
      if (player1Score === player2Score) return;
      const winner = player1Score > player2Score ? player1 : player2;
      const loser = player1Score > player2Score ? player2 : player1;
      const winnerScore = Math.max(player1Score, player2Score);
      const loserScore = Math.min(player1Score, player2Score);
      const key = `${winner.toLowerCase()}|${loser.toLowerCase()}|${winnerScore}|${loserScore}`;
      if (seen.has(key)) return;
      seen.add(key);
      results.push({ player1, player1Score, player2, player2Score, winner });
    });
  return results.slice(-20);
}

/**
 * Finds a winner only when a player posts an explicitly labelled final score
 * and the same player appears as a winner in the attached replay summary.
 * This covers a few older events that never used a bracket service while
 * avoiding guesses from ordinary replay or discussion threads.
 */
export function parseExplicitForumWinner(html: string): string | undefined {
  const $ = cheerio.load(html);
  let winner: string | undefined;

  $('.comment_wrapper').each((_, element) => {
    if (winner) return;
    const post = $(element);
    const author = post.find('.member_name a').first().text().replace(/\s+/g, ' ').trim();
    if (!author || author.length < 2 || author.length > 40) return;

    const liveBody = post.find('.comment_display_content').first();
    const comment = (liveBody.length > 0 ? liveBody : post.find('.comment').first()).clone();
    comment.find('script, style').remove();
    comment.find('br').replaceWith('\n');
    const text = comment.text().replace(/\u00a0/g, ' ');
    const finalAt = text.search(/\b(?:grand\s+)?finals?\b/i);
    if (finalAt < 0) return;

    const score = text.slice(finalAt, finalAt + 400).match(/\b([0-9])\s*[-:]\s*([0-9])\b/);
    if (!score || Number(score[1]) <= Number(score[2])) return;

    const escapedAuthor = author.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(`${escapedAuthor}\\*`, 'i').test(text)) return;
    winner = author;
  });

  return winner;
}

/**
 * Registration replies: posts whose body is essentially "in" / "count me in"
 * / "+1" / "<name> in too". Verified structure: each post is a
 * .comment_wrapper with the author in .member_name and the body in .comment.
 */
export function parseRegistrations(html: string): string[] {
  const $ = cheerio.load(html);
  const names: string[] = [];
  $('.comment_wrapper').each((_, el) => {
    const $post = $(el);
    const author = $post.find('.member_name a').first().text().replace(/\s+/g, ' ').trim();
    if (!author || author.length < 2 || author.length > 40) return;

    // Body = comment text minus the header bits (author name, timestamps).
    const liveBody = $post.find('.comment_display_content').first();
    const bodyElement = liveBody.length > 0 ? liveBody : $post.find('.comment').first();
    const body =
      bodyElement.clone().find('script, style').remove().end().text().replace(/\s+/g, ' ').trim() ||
      $post.text().replace(/\s+/g, ' ').trim();
    const normalized = body
      .toLowerCase()
      .replace(/[^a-z0-9+\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    // Short affirmative replies only ("in", "andrey in too", "count me in",
    // "sign me up", "checking in", "put me in coach"). "+1" is matched
    // separately: \b can never match before the "+" character.
    if (normalized.length > 80) return;
    const affirmative =
      /\b(in|count me in|count me|checking in|check in|checkin|ready|playing|me too|me in|sign me up|signed up|im in|put me in)\b/.test(
        normalized,
      ) || /(^|\s)\+1(\s|$)/.test(normalized);
    if (!affirmative) {
      return;
    }
    // Replies that discuss moderation or announcements usually aren't sign-ups.
    if (/(notice|edited by|prize|patch|download)/.test(normalized)) return;
    names.push(author);
  });
  return names;
}

/**
 * Organizer-maintained roster in the FIRST post of a registration thread:
 * "Registered for 2vs2:" / "A and B (team name - X)" / "Registered for 1v1:".
 * Team-name parentheticals are stripped; every player name is collected.
 */
export function parseRegistrationRoster(html: string): string[] {
  const $ = cheerio.load(html);
  const firstPostElement = $('.comment_wrapper').first();
  const liveBody = firstPostElement.find('.comment_display_content').first();
  const comment = (
    liveBody.length > 0 ? liveBody : firstPostElement.find('.comment').first()
  ).clone();
  comment.find('script, style').remove();
  comment.find('br').replaceWith('\n');
  const firstPostText = comment.text() || '';
  if (!/registered(?:\s+for)?[^:\n]{0,30}:/i.test(firstPostText)) return [];
  const teamRows = comment
    .find('li')
    .map((_, element) => $(element).text().replace(/\s+/g, ' ').trim())
    .get()
    .filter((line) => {
      const players = line.match(/\(([^)]*)\)/)?.[1];
      return Boolean(players && /\s(?:and|&|vs)\s|\+/i.test(players));
    });
  // Current GenEvo topics use an ordered list for the maintained team roster.
  // Prefer those rows so unrelated prize and footer text in the first post can
  // never be interpreted as registrations. Older topics remain line-based.
  const rosterLines = teamRows.length > 0 ? teamRows : firstPostText.split(/\n+/);
  const names: string[] = [];
  for (const rawLine of rosterLines) {
    const clean = rawLine
      .replace(/\s+/g, ' ')
      .replace(/^\d{1,3}\.\s*/, '')
      .trim();
    if (!clean) continue;
    // GenEvo team lists put the player pair inside parentheses, while older
    // XMAS lists put the team name there. Select the side that contains the
    // actual partner separator.
    const parenthetical = clean.match(/\(([^)]*)\)/)?.[1]?.trim();
    const rosterPart =
      parenthetical &&
      !/team\s*name/i.test(parenthetical) &&
      /\s(?:and|&|vs)\s|\+/i.test(parenthetical)
        ? parenthetical
        : clean.replace(/\([^)]*\)/g, ' ').trim();
    if (/^(?:registered|registration|closes|closed|note|edit)\b|^team\s*:/i.test(rosterPart)) {
      continue;
    }
    for (const token of rosterPart.split(/\s+(?:and|&|vs)\s+|\s*\+\s*|\s*[,;]\s*/i)) {
      const name = token.trim();
      if (!name || name.length < 2 || name.length > 25) continue;
      if (/^(?:in|the|team|name|closed|opens?|register)$/i.test(name)) continue;
      names.push(name);
    }
  }
  return [...new Map(names.map((n) => [n.toLowerCase(), n])).values()];
}

/**
 * Pulls the headline prize out of topic text. Priority: an explicit total
 * ("$2222 Total prize pool"), the sum of donations ("100$ Donated by …"),
 * then the largest amount. "120$2nd Place" never reads as "$2".
 */
export function extractPrize(text: string, title = ''): string | undefined {
  const value = extractPrizeValue(text, title);
  if (value === undefined) return undefined;
  const sponsorMatch = `${title} ${text}`.match(
    /sponsored by ([A-Za-z0-9 .'-]{2,30}?)(?=\s*[.,;:!)]|$)/i,
  );
  const sponsor = sponsorMatch ? sponsorMatch[1].trim().replace(/\s+/g, ' ') : undefined;
  const rendered = `${value}$`;
  return sponsor ? `${rendered} - sponsored by ${sponsor}` : rendered;
}

/**
 * Extracts a map pool from a topic page: every <li> and comma/newline
 * separated line that matches a known RA3 skirmish map, in order, deduped.
 */
export function extractMapPool(html: string): string[] {
  const $ = cheerio.load(html);
  const candidates: string[] = [];
  $('li').each((_, el) => {
    candidates.push($(el).text().replace(/\s+/g, ' ').trim());
  });
  const text = $.text();
  for (const line of text.split(/\n|,|\u2022|\*/)) {
    candidates.push(line.replace(/\s+/g, ' ').trim());
  }
  const pool: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate || candidate.length > 60) continue;
    if (!isKnownSkirmishMap(candidate)) continue;
    // isKnownSkirmishMap is fuzzy; keep the canonical capitalization from
    // the text itself (trimmed of trailing digits like "2" in "Grinderberg 2").
    const name = candidate.replace(/\s+\d{1,2}$/, '').trim();
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    pool.push(name);
    if (pool.length >= 12) break;
  }
  return pool;
}

export class ForumScannerService {
  private interval: NodeJS.Timeout | null = null;
  private scanning = false;

  start(): void {
    if (this.interval) return;
    this.interval = setInterval(() => {
      this.scan().catch((error) => logger.error('Forum scan tick failed:', error));
    }, SCAN_INTERVAL_MS);
    this.interval.unref();
    logger.info('Forum scanner started');
  }

  async scan(game?: GameId): Promise<{ results: number; registrations: number }> {
    if (this.scanning) return { results: 0, registrations: 0 };
    this.scanning = true;
    try {
      const topics = await this.fetchTopics();
      let results = 0;
      let registrations = 0;

      // With no stored events, everything links "new" at once —
      // posting a card per bracket would flood the channels. Suppress the
      // per-bracket cards; the portal scanner's announce() posts ONE card for
      // the newest tournament.
      const events = tournamentRepository.getAnnouncements(game);
      const hadEvents = events.length > 0;

      // Pair topics with stored announcements by base name.
      for (const topic of topics) {
        if (!baseName(topic.title)) continue;
        const candidates = events.filter((e) => {
          return tournamentNamesMatch(topic.title, e.title);
        });
        if (candidates.length === 0) {
          // Unpaired results topics still hold valuable history: record their
          // bracket winners for Tournament Wins without creating an event.
          if (topic.kind === 'results' && !NON_RA3_TOURNAMENT.test(topic.title)) {
            await this.recordOrphanWinners(topic.url, topic.title);
          }
          continue;
        }
        // Prefer the real announcement ("Rise of the Patch") over the portal's
        // post-tournament twin row ("Rise of the Patch, Bracket Results and…").
        const match = candidates.find((e) => isTournamentRelevant(e.title)) ?? candidates[0];

        if (topic.kind === 'results') {
          const html = await safeGetText(topic.url);
          if (!html) continue;
          const parsed = parseTopicPage(html);
          const forumMatches = parseForumMatchResults(html);
          let resultImageUrl: string | undefined;
          if (parsed.resultPage) {
            const resultPageHtml = await safeGetText(parsed.resultPage);
            resultImageUrl = resultPageHtml
              ? extractArticleImage(resultPageHtml, parsed.resultPage)
              : undefined;
          }
          tournamentRepository.saveResultCache(topic.url, {
            eventId: match.id,
            sourceType: 'forum',
            forumMatches,
          });
          let hadChallonge = false;
          let primaryUrl: string | undefined;
          const validChallonge: string[] = [];
          if (parsed.challonge.length > 0) {
            hadChallonge = !!tournamentRepository.getEventDetail(match.id)?.challongeUrl;
            // One tournament can run SEVERAL brackets (group stage + playoffs,
            // per-server qualifiers). Register them all; a "playoff/final"
            // bracket becomes the primary whose standings are THE results.
            for (const link of parsed.challonge) {
              const ref = challongeService.parseTournamentRef(link);
              if (!ref) continue;
              const bracket = await challongeService.getTournament(ref).catch(() => null);
              const name = bracket?.name ? String(bracket.name) : undefined;
              if (name && !editionsCompatible(name, match.title)) {
                logger.warn(
                  `Forum scanner: ignored bracket "${name}" for "${match.title}" (edition mismatch)`,
                );
                continue;
              }
              tournamentRepository.addBracket(match.id, link, name);
              validChallonge.push(link);
            }
            const brackets = tournamentRepository
              .getBrackets(match.id)
              .filter((bracket) =>
                bracket.bracketName ? editionsCompatible(bracket.bracketName, match.title) : true,
              );
            primaryUrl = (brackets.find((b) => b.isPrimary) ?? brackets[0])?.challongeUrl;
          }
          tournamentRepository.updateEventLinks(match.id, {
            challongeUrl: primaryUrl,
            checkinsUrl: parsed.checkins,
            registrationUrl: parsed.registration,
            topicUrl: topic.url,
            resultUrl: parsed.resultPage,
            resultImageUrl,
          });
          // Results topics usually carry the real prize + map pool list.
          const prize = extractPrize(parsed.bodyText, topic.title);
          const pool = extractMapPool(html);
          tournamentRepository.updateEventFacts(match.id, {
            prizePool: prize,
            maps: pool.length >= 3 ? pool.join(', ') : undefined,
          });
          if (validChallonge.length > 0) {
            // Enrich format/participants/winner from the live brackets — after
            // the facts refresh, because Challonge is the most reliable source
            // for the format. Only the primary bracket sets the format.
            for (const link of validChallonge) {
              await this.enrichFromChallonge(match.id, link, match.title, link === primaryUrl);
            }
            if (!hadChallonge) {
              results++;
              // A freshly discovered bracket is channel-worthy news: post the
              // event card (with its Sign Up button) to tournament channels.
              if (hadEvents) {
                await tournamentScanner.announceEvent(match.id);
              }
            }
          }
        } else if (topic.kind === 'registration') {
          tournamentRepository.updateEventLinks(match.id, { registrationUrl: topic.url });
          if (tournamentRepository.getEventDetail(match.id)?.status === 'unknown') {
            tournamentRepository.setEventStatus(match.id, 'registration');
          }
          const pages = await this.fetchRegistrationPages(topic.url);
          if (pages.length === 0) continue;
          const prize = extractPrize(
            pages.map((p) => cheerio.load(p).text()).join(' '),
            topic.title,
          );
          const pool = extractMapPool(pages[0]);
          tournamentRepository.updateEventFacts(match.id, {
            prizePool: prize,
            maps: pool.length >= 3 ? pool.join(', ') : undefined,
          });
          // Ingest "in" replies AND the organizer's roster list (XMAS-style
          // "Registered for 2vs2: A and B (team name - X)") as participants.
          const newRegistrations: string[] = [];
          for (const name of parseRegistrationRoster(pages[0])) {
            if (tournamentRepository.addParticipant(match.id, name, 'forum')) {
              registrations++;
              newRegistrations.push(name);
            }
          }
          for (const page of pages) {
            for (const name of parseRegistrations(page)) {
              if (tournamentRepository.addParticipant(match.id, name, 'forum')) {
                registrations++;
                newRegistrations.push(name);
              }
            }
          }
          if (newRegistrations.length > 0) {
            void checkinNotificationService.notify(match.id, 'registered', newRegistrations);
          }
        }
      }

      // Record winners for every completed bracket, including ones whose
      // events predate the portal announcements (FTW history → Tournament
      // Wins Top 10).
      await this.syncWinners();

      if (results + registrations > 0) {
        logger.info(
          `Forum scanner: ${results} bracket link(s), ${registrations} new registration(s)`,
        );
      }
      return { results, registrations };
    } catch (error) {
      logger.error('Forum scanner: scan failed:', error);
      return { results: 0, registrations: 0 };
    } finally {
      this.scanning = false;
    }
  }

  /** Records the champion of every completed bracket that has none yet. */
  private async syncWinners(): Promise<void> {
    // Brackets discovered before the brackets table existed.
    for (const game of ['ra3', 'genevo'] as const) {
      for (const event of tournamentRepository.getEventsWithChallonge(game)) {
        tournamentRepository.addBracket(event.id, event.challongeUrl);
      }
    }
    for (const bracket of tournamentRepository.getAllBrackets()) {
      if (bracket.game !== 'ra3' && bracket.game !== 'genevo') continue;
      try {
        const ref = challongeService.parseTournamentRef(bracket.challongeUrl);
        if (!ref) continue;
        const canonicalUrl = challongeService.bracketUrl(ref);
        if (tournamentRepository.hasWinnerFor(canonicalUrl)) continue;
        const tournament = await challongeService.getTournament(ref).catch(() => null);
        if (!tournament || !['complete', 'awaiting_review'].includes(tournament.state ?? ''))
          continue;
        if (tournament.name && !editionsCompatible(String(tournament.name), bracket.eventTitle)) {
          logger.warn(
            `Winner sync: ignored bracket "${tournament.name}" for "${bracket.eventTitle}"`,
          );
          continue;
        }
        const rankings = await challongeService.getFinalRankings(ref).catch(() => []);
        let winner: string | undefined =
          rankings.find((r) => r.rank === 1)?.name ?? rankings[0]?.name;
        if (!winner) {
          winner =
            (await challongeService.inferWinnerByMatches(ref).catch(() => null)) ?? undefined;
        }
        if (winner) {
          tournamentRepository.recordWinner(canonicalUrl, winner, bracket.eventTitle, bracket.game);
          logger.info(`Forum scanner: recorded winner ${winner} for ${canonicalUrl}`);
        }
      } catch (error) {
        logger.warn(`Winner sync failed for ${bracket.challongeUrl}:`, error);
      }
    }
  }

  /** Re-scans one event's registration topic on demand (Refresh button). */
  async refreshRegistrations(eventId: number): Promise<number> {
    const detail = tournamentRepository.getEventDetail(eventId);
    if (!detail?.registrationUrl) return -1;
    const pages = await this.fetchRegistrationPages(detail.registrationUrl);
    if (pages.length === 0) return -1;
    let added = 0;
    const newRegistrations: string[] = [];
    for (const name of parseRegistrationRoster(pages[0])) {
      if (tournamentRepository.addParticipant(eventId, name, 'forum')) {
        added++;
        newRegistrations.push(name);
      }
    }
    for (const page of pages) {
      for (const name of parseRegistrations(page)) {
        if (tournamentRepository.addParticipant(eventId, name, 'forum')) {
          added++;
          newRegistrations.push(name);
        }
      }
    }
    if (newRegistrations.length > 0) {
      void checkinNotificationService.notify(eventId, 'registered', newRegistrations);
    }
    return added;
  }

  /**
   * Pulls format, the authoritative participant list and (for finished
   * brackets) the winner from Challonge. The bracket participant list makes
   * the Players count exact even when forum replies are missed. Only the
   * event's primary bracket may set the format.
   */
  private async enrichFromChallonge(
    eventId: number,
    challongeUrl: string,
    eventTitle: string,
    isPrimary = true,
  ): Promise<void> {
    const ref = challongeService.parseTournamentRef(challongeUrl);
    if (!ref) return;
    const tournament = await challongeService.getTournament(ref).catch(() => null);
    if (!tournament) return;
    if (tournament.name && !editionsCompatible(String(tournament.name), eventTitle)) {
      logger.warn(`Challonge enrichment: ignored "${tournament.name}" for "${eventTitle}"`);
      return;
    }
    const status = statusFromChallonge(tournament.state);
    if (status !== 'unknown') tournamentRepository.setEventStatus(eventId, status);

    if (isPrimary) {
      // Format: team size from the title + bracket style from Challonge.
      const teamSize = eventTitle.match(/\b[1-4]v(?:s)?[1-4]\b/i)?.[0];
      const style = String(tournament.tournament_type || '')
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
      const formatBits: string[] = [];
      if (teamSize) formatBits.push(teamSize.replace(/vs/i, 'v').toUpperCase());
      if (style) formatBits.push(style);
      if (formatBits.length > 0) {
        tournamentRepository.setEventFormat(eventId, formatBits.join(' - '));
      }
    }

    const snapshot = await challongeService
      .getParticipantSnapshot(ref)
      .catch(() => ({ participants: [], rankings: [] }));
    const participants = snapshot.participants;
    for (const p of participants) {
      tournamentRepository.addParticipant(eventId, p.name, 'challonge');
    }

    const completed = tournament.state === 'complete' || tournament.state === 'awaiting_review';
    const matches = completed ? await challongeService.getMatches(ref).catch(() => []) : [];
    tournamentRepository.saveResultCache(challongeService.bracketUrl(ref), {
      eventId,
      sourceType: 'challonge',
      tournament,
      participants,
      rankings: snapshot.rankings,
      matches: completed ? matches : undefined,
    });

    // Finished bracket → record the champion for Tournament Wins (Top 10).
    // "awaiting_review" means the organizer hasn't confirmed yet; final_rank
    // may be empty, so the last completed match decides. Some never fill
    // Challonge's winner_id either.
    if (completed) {
      let winner = participants.find((p) => p.id === tournament.winner_id)?.name;
      if (!winner) {
        winner =
          snapshot.rankings.find((ranking) => ranking.rank === 1)?.name ??
          snapshot.rankings[0]?.name;
      }
      if (!winner) {
        const final = matches
          .filter((match) => match.state === 'complete' && match.winnerId)
          .sort((a, b) => (b.round ?? 0) - (a.round ?? 0) || b.id - a.id)[0];
        winner = participants.find((participant) => participant.id === final?.winnerId)?.name;
      }
      if (winner) {
        const game = tournamentRepository.getEventDetail(eventId)?.game ?? 'ra3';
        tournamentRepository.recordWinner(
          challongeService.bracketUrl(ref),
          winner,
          eventTitle,
          game,
        );
      }
    }
  }

  /**
   * Results topics with no matching event (older FTW editions etc.) still
   * carry bracket links — record their champions for Tournament Wins.
   */
  private async recordOrphanWinners(topicUrl: string, topicTitle: string): Promise<number> {
    if (NON_RA3_TOURNAMENT.test(topicTitle)) return 0;
    const html = await safeGetText(topicUrl);
    if (!html) return 0;
    const parsed = parseTopicPage(html);
    let recorded = 0;
    for (const link of parsed.challonge) {
      const ref = challongeService.parseTournamentRef(link);
      if (!ref) continue;
      const canonicalUrl = challongeService.bracketUrl(ref);
      if (tournamentRepository.hasWinnerFor(canonicalUrl)) continue;
      const tournament = await challongeService.getTournament(ref).catch(() => null);
      if (!tournament || !['complete', 'awaiting_review'].includes(tournament.state ?? ''))
        continue;
      if (tournament.name && !editionsCompatible(String(tournament.name), topicTitle)) continue;
      const rankings = await challongeService.getFinalRankings(ref).catch(() => []);
      let winner: string | undefined =
        rankings.find((r) => r.rank === 1)?.name ?? rankings[0]?.name;
      if (!winner) {
        winner = (await challongeService.inferWinnerByMatches(ref).catch(() => null)) ?? undefined;
      }
      if (winner) {
        tournamentRepository.recordWinner(canonicalUrl, winner, topicTitle, 'ra3');
        logger.info(`Forum scanner: recorded winner ${winner} for ${canonicalUrl}`);
        recorded++;
      }
    }
    if (parsed.challonge.length === 0 && !tournamentRepository.hasWinnerFor(topicUrl)) {
      const forumWinner = parseExplicitForumWinner(html);
      if (forumWinner) {
        tournamentRepository.recordWinner(topicUrl, forumWinner, topicTitle, 'ra3');
        logger.info(`Forum scanner: recorded forum winner ${forumWinner} for ${topicUrl}`);
        recorded++;
      }
    }
    return recorded;
  }

  /**
   * One-time resumable crawl of the complete RA3 events forum. Normal scans
   * only inspect recent pages; this pass discovers older result brackets for
   * the Tournament Wins history without flooding Discord channels.
   */
  async backfillHistoricalWinners(
    maxPages = 400,
  ): Promise<{ pages: number; topics: number; winners: number; completed: boolean }> {
    const state = tournamentRepository.getHistoricalScanState();
    if (state.completed) return { pages: 0, topics: 0, winners: 0, completed: true };

    let offset = state.nextOffset;
    let pages = 0;
    let topics = 0;
    let winners = 0;
    let completed = false;
    let previousFingerprint = '';

    while (pages < maxPages) {
      const html = await safeGetText(this.forumPageUrl(offset));
      if (!html) {
        logger.warn(
          `Historical forum crawl could not fetch offset ${offset}; checkpoint preserved`,
        );
        break;
      }
      if (!html.includes('showtopic=')) {
        completed = true;
        break;
      }
      const pageTopics = parseForumTopics(html);
      const fingerprint = pageTopics
        .map((topic) => topic.url)
        .sort()
        .join('|');
      if (fingerprint && fingerprint === previousFingerprint) {
        logger.warn(`Historical forum crawl repeated page at offset ${offset}; stopping safely`);
        completed = true;
        break;
      }
      previousFingerprint = fingerprint;

      for (const topic of pageTopics) {
        if (topic.kind !== 'results') continue;
        topics++;
        if (NON_RA3_TOURNAMENT.test(topic.title)) continue;
        winners += await this.recordOrphanWinners(topic.url, topic.title);
        await this.delay(150);
      }

      pages++;
      offset += FORUM_PAGE_SIZE;
      tournamentRepository.setHistoricalScanOffset(offset, false);

      // The last forum page has no link to another offset.
      if (!html.includes(`st=${offset}`)) {
        completed = true;
        break;
      }
      await this.delay(300);
    }

    tournamentRepository.setHistoricalScanOffset(offset, completed);
    logger.info(
      `Historical tournament crawl: ${pages} page(s), ${topics} result topic(s), ${winners} winner(s) recorded`,
    );
    return { pages, topics, winners, completed };
  }

  /** Fetches the first pages of a registration thread (posts paginate by 20). */
  private async fetchRegistrationPages(topicUrl: string): Promise<string[]> {
    const pages: string[] = [];
    let lastFingerprint = '';
    for (const start of REGISTRATION_PAGES) {
      const html = await safeGetText(`${topicUrl}&st=${start}`);
      if (!html) break;
      // The &st= offset is ignored by some routes (ads/timestamps change the
      // raw HTML) — fingerprint the first post to detect a repeated page.
      const fingerprint =
        cheerio
          .load(html)('.comment_wrapper')
          .first()
          .find('.member_name a')
          .first()
          .text()
          .trim() +
        ':' +
        cheerio.load(html)('.comment_wrapper').length;
      if (fingerprint === lastFingerprint) break; // same page again → done
      lastFingerprint = fingerprint;
      pages.push(html);
    }
    return pages;
  }

  private async fetchTopics(): Promise<ForumTopic[]> {
    const all: ForumTopic[] = [];
    for (let page = 0; page < RECENT_FORUM_PAGES; page++) {
      const url = this.forumPageUrl(page * FORUM_PAGE_SIZE);
      const html = await safeGetText(url);
      if (!html) break;
      all.push(...parseForumTopics(html));
    }
    // Newest topics first (page order), dedupe by URL.
    const seen = new Set<string>();
    return all.filter((t) => (seen.has(t.url) ? false : (seen.add(t.url), true)));
  }

  private forumPageUrl(offset: number): string {
    if (offset <= 0) return FORUM_URL;
    return `${FORUM_URL}&st=${offset}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const forumScanner = new ForumScannerService();
