import { db, addColumnIfMissing } from '../sqlite';

export function up(): void {
  addColumnIfMissing('tournament_events', 'status', "TEXT NOT NULL DEFAULT 'unknown'");
  addColumnIfMissing('tournament_winners', 'winner_key', 'TEXT');
  addColumnIfMissing('tournament_matches', 'event_id', 'INTEGER');
  addColumnIfMissing('tournament_matches', 'reporter_participant_id', 'INTEGER');
  addColumnIfMissing('tournament_matches', 'opponent_participant_id', 'INTEGER');
  addColumnIfMissing('tournament_matches', 'faction_matchup', 'TEXT');
  addColumnIfMissing('tournament_matches', 'reviewed_by', 'TEXT');
  addColumnIfMissing('tournament_matches', 'reviewed_at', 'DATETIME');

  db.exec(`
    UPDATE tournament_winners
    SET tournament_url = lower(trim(tournament_url)),
        winner_key = lower(trim(winner_name));

    CREATE INDEX IF NOT EXISTS idx_tournament_winner_key
      ON tournament_winners (winner_key);

    CREATE TABLE IF NOT EXISTS tournament_player_aliases (
      alias_key TEXT PRIMARY KEY,
      canonical_name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tournament_scan_state (
      scan_name TEXT PRIMARY KEY,
      next_offset INTEGER NOT NULL DEFAULT 0,
      completed_at DATETIME
    );
  `);
}

export function down(): void {
  db.exec('DROP TABLE IF EXISTS tournament_scan_state');
  db.exec('DROP TABLE IF EXISTS tournament_player_aliases');
}
