import { db, addColumnIfMissing } from '../sqlite';

export function up(): void {
  // Scope clans to a guild. Legacy rows keep NULL (treated as visible everywhere)
  // so existing data is never orphaned; new clans are created with a guild_id.
  addColumnIfMissing('clans', 'guild_id', 'TEXT');
}

export function down(): void {
  // No-op: leaving the column is harmless, and down() is never run by the runner.
  void db;
}
