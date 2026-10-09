import { addColumnIfMissing, db } from '../sqlite';

export function up(): void {
  addColumnIfMissing('member_activity', 'manual_rank_id', 'INTEGER');
  addColumnIfMissing('activity_rank_settings', 'ratings_enabled', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('activity_rank_settings', 'rating_points', 'INTEGER NOT NULL DEFAULT 5');
  addColumnIfMissing('activity_rank_settings', 'rating_min_votes', 'INTEGER NOT NULL DEFAULT 2');
  addColumnIfMissing('activity_rank_settings', 'rating_replay_cap', 'INTEGER NOT NULL DEFAULT 100');
  addColumnIfMissing('activity_rank_settings', 'rating_daily_cap', 'INTEGER NOT NULL DEFAULT 100');
  addColumnIfMissing('activity_rank_settings', 'rating_account_days', 'INTEGER NOT NULL DEFAULT 7');
  db.exec(`
    CREATE TABLE replay_rating_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL, user_id TEXT NOT NULL, channel_id TEXT NOT NULL,
      source_message_id TEXT NOT NULL, attachment_id TEXT NOT NULL,
      fingerprint TEXT NOT NULL, filename TEXT NOT NULL,
      card_message_id TEXT UNIQUE, bonus_awarded INTEGER NOT NULL DEFAULT 0,
      rewarded_net_votes INTEGER NOT NULL DEFAULT 0, closed INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (guild_id, fingerprint)
    );
    CREATE INDEX idx_replay_rating_owner ON replay_rating_cards (guild_id, user_id);
    CREATE TABLE replay_rating_votes (
      card_id INTEGER NOT NULL REFERENCES replay_rating_cards(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL, vote INTEGER NOT NULL CHECK (vote IN (-1, 1)),
      PRIMARY KEY (card_id, user_id)
    );
    CREATE TABLE replay_rating_daily (
      guild_id TEXT NOT NULL, user_id TEXT NOT NULL, award_date TEXT NOT NULL,
      points INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id, award_date)
    );
    CREATE TABLE replay_rating_scans (
      guild_id TEXT PRIMARY KEY, last_scan_ms INTEGER NOT NULL
    );
  `);
}

export function down(): void {
  // Keep the vote ledger and earned XP so rollback cannot reset anti-farming limits.
}
