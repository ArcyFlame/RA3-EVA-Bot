import { addColumnIfMissing, db } from '../sqlite';

export function up(): void {
  addColumnIfMissing(
    'tournament_match_confirmations',
    'player1_notified',
    'INTEGER NOT NULL DEFAULT 0',
  );
  addColumnIfMissing(
    'tournament_match_confirmations',
    'player2_notified',
    'INTEGER NOT NULL DEFAULT 0',
  );
  addColumnIfMissing('tournament_match_confirmations', 'active', 'INTEGER NOT NULL DEFAULT 1');
  // Older rows were marked sent after attempting both DMs; do not resend them.
  db.exec(`UPDATE tournament_match_confirmations
    SET player1_notified = 1, player2_notified = 1 WHERE reminder_sent = 1`);
}

export function down(): void {
  // Retain delivery history to avoid duplicate reminders after a rollback.
}
