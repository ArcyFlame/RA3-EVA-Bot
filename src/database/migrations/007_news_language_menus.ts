import { db } from '../sqlite';

export function up(): void {
  // Per-user language preference for the built-in i18n (en/ru/zh).
  db.exec(`ALTER TABLE users ADD COLUMN language TEXT NOT NULL DEFAULT 'en'`);

  // Guild preference: interactive menus (default) vs plain command lists.
  db.exec(`ALTER TABLE guilds ADD COLUMN menus_enabled INTEGER NOT NULL DEFAULT 1`);
  // News feature toggle + bound channel.
  db.exec(`ALTER TABLE guilds ADD COLUMN news_enabled INTEGER NOT NULL DEFAULT 1`);
  db.exec(`ALTER TABLE guilds ADD COLUMN news_channel_id TEXT`);

  // Items scraped from the GameReplays RA3 news portal.
  db.exec(`
    CREATE TABLE IF NOT EXISTS news_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      news_url TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      excerpt TEXT,
      posted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_news_items_posted ON news_items (posted_at)');
}

export function down(): void {
  db.exec('DROP TABLE IF EXISTS news_items');
  // SQLite has no DROP COLUMN before 3.35 — remove via table rebuild is
  // overkill for a rollback; leave the columns in place.
}
