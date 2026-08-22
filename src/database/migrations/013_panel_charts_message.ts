import { db } from '../sqlite';

export function up(): void {
  // Discord renders attachments ABOVE the embed inside one message, so the
  // stats panel uses two messages: the embed first, charts in a follow-up
  // message below it.
  db.exec(`ALTER TABLE stats_panel_config ADD COLUMN charts_message_id TEXT`);
}

export function down(): void {
  // Harmless to leave the column on SQLite versions without DROP COLUMN.
}
