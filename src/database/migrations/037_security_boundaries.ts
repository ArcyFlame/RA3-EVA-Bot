import { db, addColumnIfMissing } from '../sqlite';

export function up(): void {
  addColumnIfMissing('tournament_matches', 'guild_id', 'TEXT');
  addColumnIfMissing(
    'tournament_participants',
    'discord_binding_verified',
    'INTEGER NOT NULL DEFAULT 0',
  );
  // Imported name-only associations have no ownership proof. Keep the record,
  // but require an organizer to verify it before self-service mutations.
  db.exec(`UPDATE tournament_participants SET discord_binding_verified = 1
    WHERE source = 'discord' AND discord_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM tournament_participants other
        WHERE other.event_id = tournament_participants.event_id
          AND other.discord_id = tournament_participants.discord_id
          AND other.id <> tournament_participants.id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_verified_tournament_identity
      ON tournament_participants(event_id, discord_id)
      WHERE discord_binding_verified = 1 AND discord_id IS NOT NULL;`);
}
export function down(): void {
  /* Security provenance must not be downgraded. */
}
