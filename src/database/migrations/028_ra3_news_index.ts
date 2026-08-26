import { db } from '../sqlite';

export function up(): void {
  // RA3 news now comes from the dedicated news index. Remove mixed portal
  // article cards from the local cache; the scanner refills official news.
  db.prepare(
    `DELETE FROM news_items
     WHERE game = 'ra3'
       AND news_url NOT LIKE '%show=news&news_id=%'`,
  ).run();
}

export function down(): void {
  // Removed rows are derived cache data and are refetched from their source.
}
