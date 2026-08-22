import { db } from '../sqlite';

export function up(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT OR IGNORE INTO app_settings (key, value)
    VALUES ('dm_public_commands_enabled', '1');

    CREATE TABLE IF NOT EXISTS content_deliveries (
      guild_id TEXT NOT NULL,
      source TEXT NOT NULL,
      item_key TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      delivered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (guild_id, source, item_key)
    );

    CREATE INDEX IF NOT EXISTS idx_content_deliveries_channel
      ON content_deliveries (guild_id, source, channel_id);
  `);
}

export function down(): void {
  db.exec('DROP TABLE IF EXISTS content_deliveries');
  db.exec('DROP TABLE IF EXISTS app_settings');
}
