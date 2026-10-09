import { addColumnIfMissing, db } from '../sqlite';

export function up(): void {
  addColumnIfMissing('guilds', 'charts_enabled', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('guilds', 'masters_enabled', 'INTEGER NOT NULL DEFAULT 1');
  db.exec("UPDATE guilds SET masters_enabled = 0 WHERE game = 'genevo'");
  addColumnIfMissing('masters', 'game', "TEXT NOT NULL DEFAULT 'ra3'");
  db.exec(`CREATE TABLE masters_by_game (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, year INTEGER NOT NULL,
    patch TEXT, added_by TEXT, added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    game TEXT NOT NULL DEFAULT 'ra3', UNIQUE(game, name)
  );
  INSERT INTO masters_by_game SELECT id, name, year, patch, added_by, added_at, game FROM masters;
  DROP TABLE masters;
  ALTER TABLE masters_by_game RENAME TO masters;`);
  addColumnIfMissing('activity_rank_settings', 'replay_auto_scan', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('activity_rank_settings', 'rating_mode', "TEXT NOT NULL DEFAULT 'up'");
  addColumnIfMissing('activity_rank_settings', 'chat_enabled', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('activity_rank_settings', 'chat_points', 'INTEGER NOT NULL DEFAULT 5');
  addColumnIfMissing(
    'activity_rank_settings',
    'chat_cooldown_seconds',
    'INTEGER NOT NULL DEFAULT 60',
  );
  addColumnIfMissing('activity_rank_settings', 'chat_daily_cap', 'INTEGER NOT NULL DEFAULT 100');
  // Preserve earned XP and the anti-farming high-water mark when retiring downvotes.
  db.exec(`UPDATE replay_rating_cards SET rewarded_net_votes = MAX(rewarded_net_votes,
    (SELECT COUNT(*) FROM replay_rating_votes WHERE card_id = replay_rating_cards.id AND vote = 1))`);
  db.exec(`
    CREATE TABLE replay_self_vote_notices (
      guild_id TEXT NOT NULL, user_id TEXT NOT NULL, notice_date TEXT NOT NULL,
      PRIMARY KEY (guild_id, user_id, notice_date)
    );
    CREATE TABLE activity_chat_claims (
      guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
      activity_date TEXT NOT NULL, points INTEGER NOT NULL DEFAULT 0,
      last_awarded_at INTEGER NOT NULL DEFAULT 0, last_content_hash TEXT,
      PRIMARY KEY (guild_id, user_id, activity_date)
    );
    CREATE TABLE discovered_maps (
      game TEXT NOT NULL, map_id TEXT NOT NULL, display_name TEXT NOT NULL,
      source TEXT NOT NULL, first_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      metadata_checked_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (game, map_id)
    );
    CREATE TABLE observed_matches (
      platform TEXT NOT NULL, match_id TEXT NOT NULL, game TEXT NOT NULL,
      started_at INTEGER NOT NULL, payload TEXT NOT NULL,
      PRIMARY KEY (platform, match_id)
    );
    CREATE INDEX idx_observed_matches_game ON observed_matches(game, started_at DESC);
  `);
}

export function down(): void {
  throw new Error('Restore the pre-update database backup to downgrade schema 35.');
}
