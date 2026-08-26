import { addColumnIfMissing } from '../sqlite';

export function up(): void {
  addColumnIfMissing('tournament_events', 'image_url', 'TEXT');
}

export function down(): void {
  // Artwork URLs are retained so a rollback does not discard source data.
}
