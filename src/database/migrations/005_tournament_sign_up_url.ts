import { db, addColumnIfMissing } from '../sqlite';

export function up(): void {
  // Persist the forum sign-up thread URL so /events can show a Sign Up button
  // and an active/ended indicator without re-fetching each article.
  addColumnIfMissing('tournament_events', 'sign_up_url', 'TEXT');
}

export function down(): void {
  void db;
}
