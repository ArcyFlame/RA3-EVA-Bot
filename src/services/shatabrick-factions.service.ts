import * as cheerio from 'cheerio';
import { db } from '../database/sqlite';
import { safeGetText } from '../utils/safe-fetch';

export interface Ra3FactionCounts {
  Allies: number;
  Soviets: number;
  Empire: number;
}
export interface ShatabrickFactionSnapshot {
  counts: Ra3FactionCounts;
  generatedAt: string;
  observedAt: number;
}
const CACHE_KEY = 'shatabrick_factions:ra3:monthly';
const MAX_AGE_MS = 24 * 60 * 60000;

/** Reads a JSON object literal only. The site's JavaScript is never executed. */
function datasetJson(script: string): unknown {
  const marker = /\b(?:var|let|const)\s+dataset\s*=\s*/.exec(script);
  if (!marker) return;
  const start = marker.index + marker[0].length;
  if (script[start] !== '{') return;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let i = start; i < Math.min(script.length, start + 65536); i++) {
    const c = script[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === '{' || c === '[') {
      if (++depth > 32) return;
    } else if (c === '}' || c === ']') {
      if (--depth === 0) {
        try {
          return JSON.parse(script.slice(start, i + 1));
        } catch {
          return;
        }
      }
    }
  }
  return undefined;
}

function validCounts(value: unknown): value is Ra3FactionCounts {
  if (!value || typeof value !== 'object') return false;
  const counts = value as Ra3FactionCounts;
  return ['Allies', 'Soviets', 'Empire'].every((name) => {
    const count = counts[name as keyof Ra3FactionCounts];
    return Number.isSafeInteger(count) && count >= 0 && count <= 1_000_000_000;
  });
}

export function parseShatabrickFactionHtml(html: string): ShatabrickFactionSnapshot | undefined {
  const $ = cheerio.load(html);
  if (!$('#fstats-ra3').length) return;
  for (const script of $('script').toArray().slice(0, 50)) {
    const content = $(script).html() ?? '';
    if (!content.includes('fstats-ra3')) continue;
    const dataset = datasetJson(content) as
      | {
          monthly?: {
            all?: { factions?: unknown[]; total_matches?: unknown };
            generated_at?: unknown;
          };
        }
      | undefined;
    const month = dataset?.monthly;
    const rows = month?.all?.factions;
    if (!Array.isArray(rows) || rows.length !== 3) continue;
    const counts: Partial<Ra3FactionCounts> = {};
    const labels: Record<string, keyof Ra3FactionCounts> = {
      allies: 'Allies',
      allied: 'Allies',
      soviet: 'Soviets',
      soviets: 'Soviets',
      empire: 'Empire',
    };
    for (const row of rows) {
      if (!row || typeof row !== 'object') break;
      const { label, plays } = row as { label?: unknown; plays?: unknown };
      const name = typeof label === 'string' ? labels[label.trim().toLowerCase()] : undefined;
      if (!name || counts[name] !== undefined || typeof plays !== 'number') break;
      counts[name] = plays;
    }
    if (
      !validCounts(counts) ||
      counts.Allies + counts.Soviets + counts.Empire !== month?.all?.total_matches ||
      typeof month.generated_at !== 'string' ||
      month.generated_at.length > 64
    )
      continue;
    const generatedAt = Date.parse(month.generated_at);
    if (
      !Number.isFinite(generatedAt) ||
      generatedAt > Date.now() + 60000 ||
      generatedAt < Date.now() - MAX_AGE_MS
    )
      continue;
    return { counts, generatedAt: month.generated_at, observedAt: Date.now() };
  }
  return undefined;
}

export class ShatabrickFactionService {
  private checkedAt = 0;
  private inFlight?: Promise<ShatabrickFactionSnapshot | undefined>;

  async fetch(): Promise<ShatabrickFactionSnapshot | undefined> {
    if (this.inFlight) return this.inFlight;
    if (Date.now() - this.checkedAt < 5 * 60000) return this.cached();
    this.checkedAt = Date.now();
    this.inFlight = this.load().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  private async load(): Promise<ShatabrickFactionSnapshot | undefined> {
    const html = await safeGetText('https://www.shatabrick.com/cco/ra3/index.php', {
      timeoutMs: 7000,
    });
    const snapshot = html ? parseShatabrickFactionHtml(html) : undefined;
    if (snapshot) {
      db.prepare(
        `INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`,
      ).run(CACHE_KEY, JSON.stringify(snapshot));
      return snapshot;
    }
    return this.cached();
  }

  private cached(): ShatabrickFactionSnapshot | undefined {
    try {
      const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(CACHE_KEY) as
        | { value: string }
        | undefined;
      if (!row) return;
      const snapshot = JSON.parse(row.value) as ShatabrickFactionSnapshot;
      const stamp = Date.parse(snapshot.generatedAt);
      if (
        validCounts(snapshot.counts) &&
        Number.isFinite(stamp) &&
        stamp <= Date.now() + 60000 &&
        stamp >= Date.now() - MAX_AGE_MS
      )
        return snapshot;
    } catch {
      /* Bad or expired optional cache data is unavailable, not a zero-count sample. */
    }
    return undefined;
  }
}
export const shatabrickFactionService = new ShatabrickFactionService();
