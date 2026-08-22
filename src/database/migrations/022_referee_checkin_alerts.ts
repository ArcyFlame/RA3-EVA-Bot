import { addColumnIfMissing } from '../sqlite';

export function up(): void {
  addColumnIfMissing(
    'users',
    'referee_checkin_dm_enabled',
    'INTEGER NOT NULL DEFAULT 1',
  );
}

export function down(): void {
  // Kept on rollback because older SQLite versions cannot safely drop a column.
}
