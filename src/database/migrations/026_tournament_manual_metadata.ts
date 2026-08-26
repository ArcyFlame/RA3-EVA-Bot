import { addColumnIfMissing } from '../sqlite';

export function up(): void {
  addColumnIfMissing('tournament_events', 'manual_start_date', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('tournament_events', 'manual_status', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('tournament_events', 'manual_prize_pool', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('tournament_events', 'manual_format', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('tournament_events', 'manual_maps', 'INTEGER NOT NULL DEFAULT 0');
}

export function down(): void {
  // Manual values and their protection flags are retained to avoid losing
  // staff corrections if a deployment is rolled back.
}
