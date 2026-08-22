import { db } from '../sqlite';

export function up(): void {
  db.prepare("DELETE FROM tournament_winners WHERE tournament_url = 'https://challonge.com/images'").run();
}

export function down(): void {
  // The deleted row was a website asset path, not a tournament result.
}
