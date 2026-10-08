import { addColumnIfMissing, db } from '../sqlite';

export function up(): void {
  addColumnIfMissing('guilds', 'activity_ranks_enabled', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('guilds', 'cnc_ping_role_id', 'TEXT');

  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_rank_roles (
      guild_id TEXT NOT NULL,
      rank INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 9),
      role_id TEXT NOT NULL,
      threshold INTEGER NOT NULL CHECK (threshold >= 0),
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (guild_id, rank),
      UNIQUE (guild_id, role_id)
    );

    CREATE TABLE IF NOT EXISTS member_activity (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
      qualifying_messages INTEGER NOT NULL DEFAULT 0 CHECK (qualifying_messages >= 0),
      qualifying_cnc_pings INTEGER NOT NULL DEFAULT 0 CHECK (qualifying_cnc_pings >= 0),
      last_message_awarded_at_ms INTEGER,
      last_message_fingerprint TEXT,
      last_fingerprint_awarded_at_ms INTEGER,
      last_cnc_ping_date TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (guild_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS activity_daily_totals (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      activity_date TEXT NOT NULL,
      message_awards INTEGER NOT NULL DEFAULT 0 CHECK (message_awards >= 0),
      cnc_ping_awarded INTEGER NOT NULL DEFAULT 0 CHECK (cnc_ping_awarded IN (0, 1)),
      PRIMARY KEY (guild_id, user_id, activity_date)
    );

    CREATE INDEX IF NOT EXISTS idx_member_activity_leaderboard
      ON member_activity (guild_id, points DESC, updated_at ASC);
    CREATE INDEX IF NOT EXISTS idx_activity_daily_date
      ON activity_daily_totals (guild_id, activity_date);
  `);
}

export function down(): void {
  db.exec(`
    DROP TABLE IF EXISTS activity_daily_totals;
    DROP TABLE IF EXISTS member_activity;
    DROP TABLE IF EXISTS activity_rank_roles;
  `);
  // Guild columns are retained because SQLite cannot remove them safely on
  // older installations without rebuilding the whole guilds table.
}
