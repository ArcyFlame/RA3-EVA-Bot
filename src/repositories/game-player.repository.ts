import { BaseRepository } from './base.repository';
import { GameId } from '../config/games';

export type StatsPlatform = 'cnc_online' | 'ra3battle';

export interface ObservedPlayer {
  key: string;
  name: string;
}

export class GamePlayerRepository extends BaseRepository {
  recordPlayers(
    game: GameId,
    platform: StatsPlatform,
    players: ObservedPlayer[],
    observedDate = new Date().toISOString().slice(0, 10),
  ): number {
    if (players.length === 0) return 0;
    const existing = this.query<{ n: number }>(
      'SELECT COUNT(*) AS n FROM game_seen_players WHERE game = ? AND platform = ?',
      [game, platform],
    );
    const isBaseline = (existing?.n ?? 0) === 0;
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO game_seen_players
         (game, platform, player_key, player_name, first_seen, is_baseline)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const unique = new Map(players.map((player) => [player.key, player]));
    const transaction = this.db.transaction(() => {
      let inserted = 0;
      for (const player of unique.values()) {
        inserted += insert.run(
          game,
          platform,
          player.key,
          player.name,
          observedDate,
          isBaseline ? 1 : 0,
        ).changes;
      }
      return inserted;
    });
    return transaction();
  }

  getTrackingStart(game: GameId, platforms: StatsPlatform[]): string | undefined {
    if (platforms.length === 0) return undefined;
    const placeholders = platforms.map(() => '?').join(', ');
    return (
      this.query<{ first_seen: string | null }>(
        `SELECT MIN(first_seen) AS first_seen
       FROM game_seen_players
       WHERE game = ? AND platform IN (${placeholders})`,
        [game, ...platforms],
      )?.first_seen ?? undefined
    );
  }

  newPlayersByDay(
    game: GameId,
    platforms: StatsPlatform[],
    days = 30,
    today = new Date().toISOString().slice(0, 10),
  ): Array<number | null> {
    if (platforms.length === 0) return new Array(days).fill(null);
    const placeholders = platforms.map(() => '?').join(', ');
    const rows = this.queryAll<{ first_seen: string; n: number }>(
      `SELECT first_seen, COUNT(*) AS n
       FROM game_seen_players
       WHERE game = ?
         AND platform IN (${placeholders})
         AND is_baseline = 0
         AND first_seen >= date(?, ?)
       GROUP BY first_seen`,
      [game, ...platforms, today, `-${days - 1} days`],
    );
    const trackingStart = this.getTrackingStart(game, platforms);
    if (!trackingStart) return new Array(days).fill(null);
    const byDate = new Map(rows.map((row) => [row.first_seen, row.n]));
    const todayTimestamp = Date.parse(`${today}T00:00:00Z`);
    const out: Array<number | null> = [];
    for (let offset = days - 1; offset >= 0; offset--) {
      const date = new Date(todayTimestamp - offset * 86_400_000).toISOString().slice(0, 10);
      out.push(date >= trackingStart ? (byDate.get(date) ?? 0) : null);
    }
    return out;
  }
}

export const gamePlayerRepository = new GamePlayerRepository();
