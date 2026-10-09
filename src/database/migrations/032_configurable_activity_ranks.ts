import { addColumnIfMissing, db } from '../sqlite';

export function up(): void {
  db.exec(`
    ALTER TABLE activity_rank_roles RENAME TO activity_rank_roles_legacy;
    CREATE TABLE activity_rank_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      rank INTEGER NOT NULL CHECK (rank > 0),
      title TEXT NOT NULL,
      role_id TEXT,
      threshold INTEGER NOT NULL CHECK (threshold >= 0),
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (guild_id, rank), UNIQUE (guild_id, role_id)
    );
    INSERT INTO activity_rank_roles (guild_id, rank, title, role_id, threshold)
    SELECT guild_id, rank,
      CASE rank WHEN 1 THEN 'Private' WHEN 2 THEN 'Corporal' WHEN 3 THEN 'Sergeant'
        WHEN 4 THEN 'Lieutenant' WHEN 5 THEN 'Captain' WHEN 6 THEN 'Major'
        WHEN 7 THEN 'Colonel' WHEN 8 THEN 'Brigadier' ELSE 'General' END,
      role_id, rank * 50 * 25 FROM activity_rank_roles_legacy;
    DROP TABLE activity_rank_roles_legacy;
    CREATE TABLE activity_rank_settings (
      guild_id TEXT PRIMARY KEY, initialized INTEGER NOT NULL DEFAULT 0,
      ping_enabled INTEGER NOT NULL DEFAULT 1 CHECK (ping_enabled IN (0, 1)),
      replay_enabled INTEGER NOT NULL DEFAULT 1 CHECK (replay_enabled IN (0, 1)),
      ping_points INTEGER NOT NULL DEFAULT 25 CHECK (ping_points BETWEEN 1 AND 10000),
      replay_points INTEGER NOT NULL DEFAULT 25 CHECK (replay_points BETWEEN 1 AND 10000),
      replay_daily_cap INTEGER NOT NULL DEFAULT 3 CHECK (replay_daily_cap BETWEEN 1 AND 20),
      replay_channel_id TEXT NOT NULL DEFAULT '1321748469735620640',
      progression_mode TEXT NOT NULL DEFAULT 'per_rank' CHECK (progression_mode IN ('per_rank', 'max_days')),
      days_per_rank INTEGER NOT NULL DEFAULT 50 CHECK (days_per_rank BETWEEN 1 AND 10000),
      max_rank_days INTEGER NOT NULL DEFAULT 450 CHECK (max_rank_days BETWEEN 1 AND 100000),
      xp_per_level INTEGER NOT NULL DEFAULT 100 CHECK (xp_per_level BETWEEN 1 AND 1000000),
      version INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE activity_replay_awards (
      guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
      fingerprint TEXT NOT NULL, activity_date TEXT NOT NULL,
      PRIMARY KEY (guild_id, fingerprint)
    );
    CREATE INDEX idx_activity_replay_member ON activity_replay_awards (guild_id, user_id);
    CREATE TABLE activity_retired_roles (
      guild_id TEXT NOT NULL, role_id TEXT NOT NULL, PRIMARY KEY (guild_id, role_id)
    );
    UPDATE member_activity SET points = MAX(0, points - qualifying_messages * 10);
  `);
  addColumnIfMissing('member_activity', 'qualifying_replays', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('activity_daily_totals', 'replay_awards', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('activity_daily_totals', 'replay_downloads', 'INTEGER NOT NULL DEFAULT 0');
}

export function down(): void {
  // Preserve earned activity and rank definitions when rolling back application code.
  db.exec(
    'DROP TABLE IF EXISTS activity_replay_awards; DROP TABLE IF EXISTS activity_rank_settings;',
  );
}
