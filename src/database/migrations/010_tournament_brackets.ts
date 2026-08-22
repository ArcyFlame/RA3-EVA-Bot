import { db } from '../sqlite';

export function up(): void {
  // One tournament can run SEVERAL Challonge brackets: group stage +
  // playoffs, or separate qualifiers per server (Gathering Storm runs a
  // RA3BattleNet bracket AND a C&C Online qualifier bracket).
  db.exec(`
    CREATE TABLE IF NOT EXISTS tournament_brackets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      challonge_url TEXT UNIQUE NOT NULL,
      bracket_name TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES tournament_events(id) ON DELETE CASCADE
    );
  `);
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_tournament_brackets_event ON tournament_brackets (event_id)',
  );
}

export function down(): void {
  db.exec('DROP TABLE IF EXISTS tournament_brackets');
}
