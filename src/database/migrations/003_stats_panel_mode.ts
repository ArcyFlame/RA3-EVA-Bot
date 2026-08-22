import { db, addColumnIfMissing } from '../sqlite';

export function up(): void {
  // Persist the leaderboard mode selection across stats-panel auto-updates.
  addColumnIfMissing('stats_panel_config', 'mode', "TEXT DEFAULT '1v1'");
}

export function down(): void {
  // No-op: leaving the column is harmless, and SQLite DROP COLUMN support is
  // version-dependent. down() is never run by the migration runner anyway.
  void db;
}
