import { addColumnIfMissing, db } from '../sqlite';

export function up(): void {
  addColumnIfMissing('tournament_events', 'result_url', 'TEXT');
  addColumnIfMissing('tournament_events', 'result_image_url', 'TEXT');
  addColumnIfMissing('news_items', 'image_url', 'TEXT');

  db.exec(`
    CREATE TABLE IF NOT EXISTS tournament_result_cache (
      source_url TEXT PRIMARY KEY,
      event_id INTEGER,
      source_type TEXT NOT NULL,
      tournament_json TEXT,
      rankings_json TEXT,
      matches_json TEXT,
      participants_json TEXT,
      forum_matches_json TEXT,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES tournament_events(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_tournament_result_cache_event
      ON tournament_result_cache (event_id, updated_at);
  `);
}

export function down(): void {
  db.exec('DROP TABLE IF EXISTS tournament_result_cache');
  // Media/link columns are retained because they contain source-derived data.
}
