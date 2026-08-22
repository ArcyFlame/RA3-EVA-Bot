import { db } from '../sqlite';

export function up(): void {
  // First-seen day of every ladder persona (New Players chart).
  db.exec(`
    CREATE TABLE IF NOT EXISTS ra3b_seen_players (
      persona_id INTEGER PRIMARY KEY,
      persona_name TEXT,
      first_seen TEXT NOT NULL DEFAULT (date('now'))
    );
  `);
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_ra3b_seen_players_date ON ra3b_seen_players (first_seen)',
  );
}

export function down(): void {
  db.exec('DROP TABLE IF EXISTS ra3b_seen_players');
}
