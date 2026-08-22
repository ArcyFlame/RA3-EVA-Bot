import { db } from '../sqlite';
import { normalizeTournamentWinnerNames } from '../../utils/winner-names';

interface WinnerRow {
  id: number;
  tournament_url: string;
  winner_name: string;
  event_title: string | null;
  game: string;
  recorded_at: string;
}

export function up(): void {
  const rows = db.prepare('SELECT * FROM tournament_winners ORDER BY id').all() as WinnerRow[];
  const remove = db.prepare('DELETE FROM tournament_winners WHERE id = ?');
  const insert = db.prepare(
    `INSERT OR IGNORE INTO tournament_winners
       (tournament_url, winner_name, winner_key, event_title, game, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const row of rows) {
    const teamEvent = !!row.event_title && /\b[2-4]v(?:s)?[2-4]\b/i.test(row.event_title);
    const names = normalizeTournamentWinnerNames(row.winner_name, teamEvent);
    if (names.length === 1 && names[0] === row.winner_name) continue;
    remove.run(row.id);
    for (const name of names) {
      insert.run(
        row.tournament_url,
        name,
        name.toLocaleLowerCase('en-US'),
        row.event_title,
        row.game,
        row.recorded_at,
      );
    }
  }
}

export function down(): void {
  // Cleanup is intentionally one-way; the original display labels were not identities.
}
