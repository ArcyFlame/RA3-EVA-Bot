import { db } from '../sqlite';

export function up(): void {
  // RA3BattleNet persona id for /profile lookups. Names alone can't resolve
  // players who are unranked in the current season (they appear on no ladder
  // page) — the numeric id (from the player's ra3battle.cn profile URL) works
  // with the persona stats/history endpoints directly.
  db.exec(`ALTER TABLE users ADD COLUMN ra3b_persona_id INTEGER`);
}

export function down(): void {
  // SQLite has no DROP COLUMN on old versions; harmless to leave the column.
}
