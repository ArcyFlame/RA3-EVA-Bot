import * as cheerio from 'cheerio';
import { safeGetText } from '../utils/safe-fetch';

const SHATABRICK_BASE = 'https://www.shatabrick.com';
const PROFILE_PATH = '/cco/ra3/index.php?g=ra3&a=pp&id=';

export const SHATABRICK_MODE_LABELS = [
  'Unranked',
  'Ranked 1v1',
  'Ranked 2v2',
  'Clan 1v1',
  'Clan 2v2',
] as const;
export type ShatabrickMode = (typeof SHATABRICK_MODE_LABELS)[number];

export interface ShatabrickModeStats {
  games: number;
  wins: number;
  losses: number;
  elo?: number;
  rank?: number;
}

export interface ShatabrickProfile {
  profileId: number;
  nickname: string;
  profileUrl: string;
  rankImageUrl?: string;
  rankLabel?: string;
  level?: number;
  score?: number;
  modes: Record<ShatabrickMode, ShatabrickModeStats>;
}

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function numberFrom(value: string): number {
  const parsed = Number(value.replace(/[^0-9-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function emptyModes(): Record<ShatabrickMode, ShatabrickModeStats> {
  return Object.fromEntries(
    SHATABRICK_MODE_LABELS.map((label) => [label, { games: 0, wins: 0, losses: 0 }]),
  ) as Record<ShatabrickMode, ShatabrickModeStats>;
}

function normalizeMode(value: string): ShatabrickMode | undefined {
  const clean = compact(value).toLowerCase().replace(/vs/g, 'v');
  return SHATABRICK_MODE_LABELS.find((mode) => mode.toLowerCase().replace(/vs/g, 'v') === clean);
}

function absoluteUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value, SHATABRICK_BASE).toString();
  } catch {
    return undefined;
  }
}

export function parseShatabrickProfileHtml(
  html: string,
  profileId: number,
  fallbackName = `Player ${profileId}`,
): ShatabrickProfile | null {
  const $ = cheerio.load(html);
  const bodyText = compact($('body').text());
  if (!bodyText || /no player|unknown player|invalid profile/i.test(bodyText)) return null;

  const labelValue = (label: RegExp): string | undefined => {
    let found: string | undefined;
    $('tr').each((_, row) => {
      if (found) return;
      const cells = $(row)
        .find('th,td')
        .map((__, cell) => compact($(cell).text()))
        .get();
      if (cells.length >= 2 && label.test(cells[0])) found = cells[1];
    });
    return found;
  };

  const titleText = compact($('title').text());
  const headingText = compact($('h1,h2,.playername,.nickname').first().text());
  const nickname =
    labelValue(/^(?:nickname|persona|player(?: name)?)\s*:?$/i) ||
    headingText
      .replace(/player profile|statistics|shatabrick/gi, '')
      .replace(/^[-: ]+|[-: ]+$/g, '') ||
    titleText.match(/(?:profile|statistics)(?: for)?\s+(.+?)(?:\s*[-|]\s*shatabrick)?$/i)?.[1] ||
    fallbackName;

  const modes = emptyModes();
  $('table').each((_, table) => {
    const rows = $(table).find('tr').toArray();
    const headerRow = rows.find((row) => {
      const text = compact($(row).text()).toLowerCase();
      return text.includes('unranked') && text.includes('ranked 1v1');
    });
    if (headerRow) {
      const headers = $(headerRow)
        .find('th,td')
        .map((__, cell) => compact($(cell).text()))
        .get();
      const columns = new Map<number, ShatabrickMode>();
      headers.forEach((header, index) => {
        const mode = normalizeMode(header);
        if (mode) columns.set(index, mode);
      });
      for (const row of rows) {
        const cells = $(row)
          .find('th,td')
          .map((__, cell) => compact($(cell).text()))
          .get();
        const metric = cells[0]?.replace(/[^a-z]/gi, '').toLowerCase();
        if (!['games', 'wins', 'losses'].includes(metric)) continue;
        for (const [index, mode] of columns) {
          modes[mode][metric as 'games' | 'wins' | 'losses'] = numberFrom(cells[index] || '0');
        }
      }
      for (const mode of columns.values()) {
        if (modes[mode].wins === 0 && modes[mode].games >= modes[mode].losses) {
          modes[mode].wins = modes[mode].games - modes[mode].losses;
        }
      }
    }

    const headerCells = rows
      .map((row) =>
        $(row)
          .find('th,td')
          .map((__, cell) => compact($(cell).text()).toLowerCase())
          .get(),
      )
      .find((cells) => cells.includes('elo') && cells.includes('wins') && cells.includes('losses'));
    if (!headerCells) return;
    const column = (name: string) => headerCells.findIndex((cell) => cell === name);
    for (const row of rows) {
      const cells = $(row)
        .find('th,td')
        .map((__, cell) => compact($(cell).text()))
        .get();
      const mode = normalizeMode(cells[0] || '');
      if (!mode) continue;
      const rankIndex = column('rank');
      const eloIndex = column('elo');
      const winsIndex = column('wins');
      const lossesIndex = column('losses');
      if (rankIndex >= 0) modes[mode].rank = numberFrom(cells[rankIndex]);
      if (eloIndex >= 0) modes[mode].elo = numberFrom(cells[eloIndex]);
      if (winsIndex >= 0) modes[mode].wins = numberFrom(cells[winsIndex]);
      if (lossesIndex >= 0) modes[mode].losses = numberFrom(cells[lossesIndex]);
      modes[mode].games = Math.max(modes[mode].games, modes[mode].wins + modes[mode].losses);
    }
  });

  const rankImage = $('img[src*="IconsLarge"], img[src*="iconslarge"]').first();
  const rankImageUrl = absoluteUrl(rankImage.attr('src'));
  const levelText = labelValue(/^level\s*:?$/i) || bodyText.match(/\bLevel:\s*([0-9,]+)/i)?.[1];
  const scoreText = labelValue(/^score\s*:?$/i) || bodyText.match(/\bScore:\s*([0-9,]+)/i)?.[1];
  const rankLabel =
    compact(rankImage.attr('alt') || rankImage.attr('title') || '') ||
    (levelText ? `Level ${numberFrom(levelText)}` : undefined);

  return {
    profileId,
    nickname: compact(nickname).slice(0, 100),
    profileUrl: `${SHATABRICK_BASE}${PROFILE_PATH}${profileId}`,
    rankImageUrl,
    rankLabel,
    level: levelText ? numberFrom(levelText) : undefined,
    score: scoreText ? numberFrom(scoreText) : undefined,
    modes,
  };
}

/** Resolves an exact nickname from Shatabrick's commander/persona result page. */
export function extractShatabrickProfileId(html: string, nickname: string): number {
  const $ = cheerio.load(html);
  const wanted = compact(nickname).toLowerCase();
  let profileId = 0;
  $('a[href*="a=pp"][href*="id="]').each((_, element) => {
    if (profileId || compact($(element).text()).toLowerCase() !== wanted) return;
    const href = $(element).attr('href') || '';
    profileId = Number(new URL(href, SHATABRICK_BASE).searchParams.get('id') || 0);
  });
  if (profileId) return profileId;
  $('span[title^="Profile"], span[title^="profile"]').each((_, element) => {
    if (profileId || compact($(element).text()).toLowerCase() !== wanted) return;
    profileId = Number(($(element).attr('title') || '').match(/profile\s+(\d+)/i)?.[1] || 0);
  });
  return profileId;
}

export class ShatabrickService {
  async resolve(identifier: string): Promise<ShatabrickProfile | null> {
    const clean = identifier.trim();
    if (!clean) return null;
    let profileId = /^\d{1,12}$/.test(clean) ? Number(clean) : 0;
    if (!profileId) {
      const searchUrl = `${SHATABRICK_BASE}/cco/ra3/index.php?g=ra3&a=sp&name=${encodeURIComponent(clean)}`;
      const searchHtml = await safeGetText(searchUrl);
      if (!searchHtml) return null;
      profileId = extractShatabrickProfileId(searchHtml, clean);
      if (!profileId) return null;
    }
    const html = await safeGetText(`${SHATABRICK_BASE}${PROFILE_PATH}${profileId}`);
    return html ? parseShatabrickProfileHtml(html, profileId, clean) : null;
  }
}

export const shatabrickService = new ShatabrickService();
