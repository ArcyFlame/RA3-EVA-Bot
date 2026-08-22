import { db } from '../sqlite';

export function up(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS youtube_notified_videos (
      video_id TEXT PRIMARY KEY,
      channel_id TEXT,
      notified_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export function down(): void {
  db.exec('DROP TABLE IF EXISTS youtube_notified_videos');
}
