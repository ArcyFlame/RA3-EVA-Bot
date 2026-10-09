import { db } from '../database/sqlite';
import { GameId } from '../config/games';
import { sourceGet } from '../utils/safe-fetch';
import { summarizeMatch, MatchSummary } from '../utils/match-format';
import { cleanGameMapName } from '../data/game-maps';
import { emptyGenevoFactionDistribution, normalizeGenevoFaction } from '../data/genevo-factions';
import { mapCatalogService } from './map-catalog.service';

const WINDOW_MS = 30 * 86400000;
export function parseObservedMatch(raw: any): { game: GameId; summary: MatchSummary } | undefined {
  if (
    !raw ||
    typeof raw !== 'object' ||
    typeof raw.id !== 'string' ||
    !/^[a-zA-Z0-9-]{1,80}$/.test(raw.id)
  )
    return;
  const game = String(raw.modFamilyName).toLowerCase();
  if (game !== 'ra3' && game !== 'genevo') return;
  const startedAt = Date.parse(raw.startTime);
  if (
    !Number.isFinite(startedAt) ||
    startedAt > Date.now() + 60000 ||
    startedAt < Date.now() - WINDOW_MS
  )
    return;
  if (typeof raw.map !== 'string' || raw.map.length > 512) return;
  if (
    !Array.isArray(raw.winners) ||
    !Array.isArray(raw.losers) ||
    !raw.winners.length ||
    !raw.losers.length
  )
    return;
  const rows = [...raw.winners, ...raw.losers];
  if (
    rows.length < 2 ||
    rows.length > 16 ||
    rows.some((p) => !p || typeof p.personaName !== 'string' || !p.personaName.trim())
  )
    return;
  const type = String(raw.type ?? '').replace(/^Valid/i, '');
  // Winner/loser arrays represent teams only for a reported two-team match.
  const teamSizes = type.match(/^(\d)v(\d)$/);
  if (teamSizes && rows.length !== Number(teamSizes[1]) + Number(teamSizes[2])) return;
  const grouped =
    !!teamSizes &&
    raw.winners.length === Number(teamSizes[1]) &&
    raw.losers.length === Number(teamSizes[2]);
  const summary = summarizeMatch(
    {
      type,
      players: rows.map((p: any, i: number) => ({
        personaName: p.personaName,
        faction: p.faction,
        isAI: p.isAI,
        team: grouped ? (i < raw.winners.length ? 'winner' : 'loser') : p.team,
      })),
    },
    'RA3BattleNet',
    game === 'genevo' ? mapCatalogService.displayName(raw.map) : cleanGameMapName(raw.map, game),
  );
  summary.startedAt = startedAt;
  summary.matchId = raw.id;
  return { game, summary };
}

export class ObservedMatchService {
  private refreshedAt = 0;
  private inFlight?: Promise<void>;
  async refresh(): Promise<void> {
    if (Date.now() - this.refreshedAt < 5 * 60000) return;
    if (this.inFlight) return this.inFlight;
    this.refreshedAt = Date.now();
    this.inFlight = this.load().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }
  private async load(): Promise<void> {
    try {
      const records: Array<{
        game: GameId;
        summary: MatchSummary;
      }> = [];
      const seen = new Set<string>();
      // A mixed-mod first page can omit GenEvo. Read a bounded additional two pages.
      for (let page = 1; page <= 3; page++) {
        const response = await sourceGet(
          `https://api.ra3battle.cn/api/match/get/recent/all/${page}/result`,
          { timeout: 5000 },
        ).catch(() => undefined);
        if (!response) break;
        const { data } = response;
        if (!Array.isArray(data?.records)) break;
        let added = false;
        for (const raw of data.records.slice(0, 100)) {
          const record = parseObservedMatch(raw);
          if (!record || seen.has(record.summary.matchId!)) continue;
          seen.add(record.summary.matchId!);
          records.push(record);
          added = true;
        }
        if (!added || data.records.length < 100 || data.pageOutOfLimit === true) break;
      }
      db.transaction(() => {
        const insert = db.prepare(
          `INSERT INTO observed_matches(platform,match_id,game,started_at,payload) VALUES('ra3b',?,?,?,?)
           ON CONFLICT(platform,match_id) DO UPDATE SET payload=excluded.payload
           WHERE game=excluded.game AND started_at=excluded.started_at`,
        );
        const prior = db.prepare(
          "SELECT payload FROM observed_matches WHERE platform='ra3b' AND match_id=?",
        );
        for (const { game, summary } of records) {
          // Providers can correct previously unknown faction IDs. Keep known values on regressions.
          const saved = prior.get(summary.matchId) as { payload: string } | undefined;
          if (saved) {
            try {
              const previous = JSON.parse(saved.payload) as MatchSummary;
              if (Array.isArray(previous.participants))
                for (const player of summary.participants ?? [])
                  if (!normalizeGenevoFaction(player.faction ?? '') && game === 'genevo') {
                    const old = previous.participants.find((p) => p.name === player.name);
                    if (normalizeGenevoFaction(old?.faction ?? '')) player.faction = old!.faction;
                  }
            } catch {
              /* Replace an invalid cached record with the verified response. */
            }
          }
          insert.run(summary.matchId, game, summary.startedAt, JSON.stringify(summary));
        }
        db.prepare('DELETE FROM observed_matches WHERE started_at < ?').run(Date.now() - WINDOW_MS);
        db.exec(
          'DELETE FROM observed_matches WHERE rowid NOT IN (SELECT rowid FROM observed_matches ORDER BY started_at DESC LIMIT 5000)',
        );
      })();
    } catch {
      /* Retain the last verified records during provider outages. */
    }
  }
  recent(game: GameId): MatchSummary[] {
    return this.read(game, 5);
  }
  private read(game: GameId, limit: number): MatchSummary[] {
    try {
      return (
        db
          .prepare(
            "SELECT payload FROM observed_matches WHERE game = ? AND platform = 'ra3b' AND started_at >= ? ORDER BY started_at DESC LIMIT ?",
          )
          .all(game, Date.now() - WINDOW_MS, limit) as Array<{ payload: string }>
      ).flatMap((row) => {
        try {
          const summary = JSON.parse(row.payload);
          return Array.isArray(summary.participants) && typeof summary.map === 'string'
            ? [summary]
            : [];
        } catch {
          return [];
        }
      });
    } catch {
      return [];
    }
  }
  factions() {
    const distribution = emptyGenevoFactionDistribution();
    for (const match of this.read('genevo', 5000))
      for (const player of match.participants ?? []) {
        const faction = normalizeGenevoFaction(player.faction ?? '');
        if (faction && !player.isAI && !player.observer)
          distribution[faction] = (distribution[faction] ?? 0) + 1;
      }
    return distribution;
  }
}
export const observedMatchService = new ObservedMatchService();
