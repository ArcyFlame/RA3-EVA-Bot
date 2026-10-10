import { addColumnIfMissing, db } from '../sqlite';

export function up(): void {
  addColumnIfMissing('replay_rating_cards', 'archive_attachment_id', 'TEXT');
  addColumnIfMissing('replay_rating_cards', 'description', 'TEXT');
  addColumnIfMissing('replay_rating_cards', 'revision', 'INTEGER NOT NULL DEFAULT 0');
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_replay_source ON replay_rating_cards(guild_id,source_message_id)',
  );
}

export function down(): void {
  throw new Error('Restore the pre-update database backup to downgrade schema 36.');
}
