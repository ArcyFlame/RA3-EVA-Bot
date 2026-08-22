import { db } from '../sqlite';

export function up(): void {
  db.prepare(
    `INSERT INTO tournament_scan_state (scan_name, next_offset, completed_at)
     VALUES ('forum_history', 0, NULL)
     ON CONFLICT(scan_name) DO UPDATE SET next_offset = 0, completed_at = NULL`,
  ).run();
}

export function down(): void {
  // The scan is read-only apart from its local winner cache and can remain complete.
}
