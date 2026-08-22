import { up as cleanWinnerNames } from './018_winner_name_cleanup';

export function up(): void {
  cleanWinnerNames();
}

export function down(): void {
  // Replay-table winner markers are presentation characters, not nickname data.
}
