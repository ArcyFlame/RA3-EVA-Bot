import { db } from '../sqlite';

export function up(): void {
  // Tournament pipeline: links discovered from the GameReplays forum topics.
  db.exec(`ALTER TABLE tournament_events ADD COLUMN challonge_url TEXT`);
  db.exec(`ALTER TABLE tournament_events ADD COLUMN checkins_url TEXT`);
  db.exec(`ALTER TABLE tournament_events ADD COLUMN registration_url TEXT`);
  db.exec(`ALTER TABLE tournament_events ADD COLUMN topic_url TEXT`);

  // Players who registered (forum replies / Discord) and their check-in state.
  db.exec(`
    CREATE TABLE IF NOT EXISTS tournament_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      source TEXT NOT NULL DEFAULT 'forum',
      name TEXT NOT NULL,
      discord_id TEXT,
      checked_in INTEGER NOT NULL DEFAULT 0,
      checked_in_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(event_id, name)
    );
  `);
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_tournament_participants_event ON tournament_participants (event_id)',
  );

  // Multi-game support: which C&C game this server runs (ra3 | kw | genevo).
  db.exec(`ALTER TABLE guilds ADD COLUMN game TEXT NOT NULL DEFAULT 'ra3'`);
  // JSON array of help-category values the guild hides from /help.
  db.exec(`ALTER TABLE guilds ADD COLUMN hidden_help_categories TEXT`);
}

export function down(): void {
  db.exec('DROP TABLE IF EXISTS tournament_participants');
}
