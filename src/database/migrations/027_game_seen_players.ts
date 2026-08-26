import { db } from '../sqlite';

export function up(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS game_seen_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game TEXT NOT NULL,
      platform TEXT NOT NULL,
      player_key TEXT NOT NULL,
      player_name TEXT,
      first_seen TEXT NOT NULL DEFAULT (date('now')),
      is_baseline INTEGER NOT NULL DEFAULT 0,
      UNIQUE (game, platform, player_key)
    );
  `);
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_game_seen_players_lookup ON game_seen_players (game, platform, first_seen)',
  );
}

export function down(): void {
  db.exec('DROP TABLE IF EXISTS game_seen_players');
}
