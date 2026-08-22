import { db } from '../sqlite';

export function up(): void {
  // RA3BattleNet accounts are a separate system from Shatabrick (C&C Online):
  // players link each platform independently so /profile can query the right
  // ladder with the right account name.
  db.exec(`ALTER TABLE users ADD COLUMN ra3b_username TEXT`);
}

export function down(): void {
  // SQLite historically lacks DROP COLUMN; rollback leaves the column in place.
}
