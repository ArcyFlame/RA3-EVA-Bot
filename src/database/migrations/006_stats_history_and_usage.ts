import { db } from '../sqlite';

export function up(): void {
  // Periodic snapshots of the API stats (most played maps, top players,
  // faction split) so the bot keeps a memory of community history.
  db.exec(`
    CREATE TABLE IF NOT EXISTS stats_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      online_now INTEGER NOT NULL DEFAULT 0,
      cnc_online INTEGER NOT NULL DEFAULT 0,
      ra3battle_online INTEGER NOT NULL DEFAULT 0,
      faction_distribution TEXT,
      top_maps TEXT,
      top_players TEXT
    );
  `);

  // Which commands were used, by whom, where. Powering usage stats and audits.
  db.exec(`
    CREATE TABLE IF NOT EXISTS command_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      command TEXT NOT NULL,
      user_id TEXT NOT NULL,
      guild_id TEXT,
      used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_command_usage_command ON command_usage (command)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_stats_snapshots_created ON stats_snapshots (created_at)');
}

export function down(): void {
  db.exec('DROP TABLE IF EXISTS stats_snapshots');
  db.exec('DROP TABLE IF EXISTS command_usage');
}
