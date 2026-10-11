import { db, addColumnIfMissing } from '../sqlite';

export function up(): void {
  addColumnIfMissing('tournament_participants', 'external_tournament_id', 'TEXT');
  addColumnIfMissing('tournament_participants', 'external_participant_id', 'TEXT');
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_external_tournament_identity
      ON tournament_participants(event_id, external_tournament_id, external_participant_id)
      WHERE external_tournament_id IS NOT NULL AND external_participant_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS tournament_write_brackets (
      tournament_id TEXT PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES tournament_events(id) ON DELETE CASCADE,
      guild_id TEXT NOT NULL,
      ref TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS checkin_alert_budget (
      event_id INTEGER NOT NULL REFERENCES tournament_events(id) ON DELETE CASCADE,
      player_key TEXT NOT NULL,
      notified_at INTEGER NOT NULL,
      PRIMARY KEY(event_id, player_key)
    );`);
  // Old default-on flags do not distinguish consent from an implicit default.
  // Require referees to opt in once after this migration, without deleting users.
  const columns = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
  if (columns.some((c) => c.name === 'referee_checkin_dm_enabled'))
    db.exec('UPDATE users SET referee_checkin_dm_enabled = 0');
}

export function down(): void {
  /* Provider ownership and notification consent must not be downgraded. */
}
