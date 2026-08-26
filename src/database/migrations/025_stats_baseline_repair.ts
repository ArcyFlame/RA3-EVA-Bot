import { db } from '../sqlite';

export function up(): void {
  // Existing ladder entries predate reliable first-seen tracking. Treat the
  // current set as the baseline so an upgrade cannot create a false one-day
  // surge in the New Players chart.
  db.exec('UPDATE ra3b_seen_players SET is_baseline = 1');
  db.prepare(
    `INSERT INTO stats_tracking_meta (key, value)
     VALUES ('new_players_started_at', date('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run();
}

export function down(): void {
  // Baseline classification is intentionally retained; reversing it would
  // turn established players into false new-player records.
}
