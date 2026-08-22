import { db } from '../sqlite';

/** Removes the copied FTW #88 Challonge link that appeared in the FTW 90 post. */
export function up(): void {
  db.prepare(
    `DELETE FROM tournament_brackets
     WHERE lower(challonge_url) = 'https://challonge.com/ip08hm5r'
       AND event_id IN (
         SELECT id FROM tournament_events
         WHERE lower(title) LIKE '%ftw%90%'
       )`,
  ).run();
  db.prepare(
    `UPDATE tournament_events
     SET challonge_url = NULL
     WHERE lower(challonge_url) = 'https://challonge.com/ip08hm5r'
       AND lower(title) LIKE '%ftw%90%'`,
  ).run();
}

export function down(): void {
  // The rejected link is known to belong to FTW #88 and must not be restored.
}
