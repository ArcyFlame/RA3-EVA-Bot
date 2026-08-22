import { db, addColumnIfMissing } from '../sqlite';

export function up(): void {
  addColumnIfMissing('ra3b_seen_players', 'is_baseline', 'INTEGER NOT NULL DEFAULT 0');

  // Players already present when tracking was introduced are the baseline,
  // not newly created accounts. Their actual account creation dates are not
  // exposed by the RA3BattleNet API.
  db.exec(`UPDATE ra3b_seen_players SET is_baseline = 1`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS stats_tracking_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const firstSeen = db
    .prepare('SELECT MIN(first_seen) AS first_seen FROM ra3b_seen_players')
    .get() as { first_seen: string | null };
  if (firstSeen.first_seen) {
    db.prepare(
      `INSERT OR IGNORE INTO stats_tracking_meta (key, value)
       VALUES ('new_players_started_at', ?)`,
    ).run(firstSeen.first_seen);
  }
}

export function down(): void {
  db.exec('DROP TABLE IF EXISTS stats_tracking_meta');
}
