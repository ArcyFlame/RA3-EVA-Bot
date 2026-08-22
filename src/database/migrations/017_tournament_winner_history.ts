import { db } from '../sqlite';
import { normalizeTournamentWinnerNames } from '../../utils/winner-names';

interface OldWinner {
  tournament_url: string;
  winner_name: string;
  recorded_at: string;
}

export function up(): void {
  const oldRows = db
    .prepare('SELECT tournament_url, winner_name, recorded_at FROM tournament_winners')
    .all() as OldWinner[];

  db.exec(`
    DROP INDEX IF EXISTS idx_tournament_winner_key;
    ALTER TABLE tournament_winners RENAME TO tournament_winners_legacy;

    CREATE TABLE tournament_winners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_url TEXT NOT NULL,
      winner_name TEXT NOT NULL,
      winner_key TEXT NOT NULL,
      event_title TEXT,
      game TEXT NOT NULL DEFAULT 'ra3',
      recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tournament_url, winner_key)
    );

    CREATE INDEX idx_tournament_winner_key ON tournament_winners (winner_key);
  `);

  const insert = db.prepare(
    `INSERT OR IGNORE INTO tournament_winners
       (tournament_url, winner_name, winner_key, event_title, game, recorded_at)
     VALUES (?, ?, ?, NULL, 'ra3', ?)`,
  );
  for (const row of oldRows) {
    const url = row.tournament_url.trim().toLowerCase();
    // This URL is the unrelated sample "Generals" bracket, verified against
    // its GameReplays topic and Challonge participants.
    if (url === 'https://challonge.com/generals') continue;
    for (const winner of normalizeTournamentWinnerNames(row.winner_name)) {
      insert.run(url, winner, winner.toLocaleLowerCase('en-US'), row.recorded_at);
    }
  }
  db.exec(`
    DROP TABLE tournament_winners_legacy;

    INSERT OR REPLACE INTO tournament_player_aliases (alias_key, canonical_name) VALUES
      ('greeeeeenalert', 'GreenAlert'),
      ('greeeen', 'GreenAlert'),
      ('andrey', 'Andrey');

    UPDATE tournament_scan_state
    SET next_offset = 0, completed_at = NULL
    WHERE scan_name = 'forum_history';
  `);
}

export function down(): void {
  db.exec(`
    ALTER TABLE tournament_winners RENAME TO tournament_winners_v2;
    CREATE TABLE tournament_winners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_url TEXT UNIQUE NOT NULL,
      winner_name TEXT NOT NULL,
      recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT OR IGNORE INTO tournament_winners (tournament_url, winner_name, recorded_at)
      SELECT tournament_url, winner_name, recorded_at FROM tournament_winners_v2 ORDER BY id;
    DROP TABLE tournament_winners_v2;
  `);
}
