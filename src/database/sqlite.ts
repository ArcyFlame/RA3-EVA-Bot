import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { env } from '../config/env';
import { logger } from '../utils/logger';

const dbDir = path.dirname(env.DATABASE_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

export const db = new Database(env.DATABASE_PATH);

// ── Pragmas: durability + concurrency ────────────────────────────────────────
// WAL lets readers proceed alongside the writer (webhook pushes vs. pollers).
// busy_timeout makes the writer wait instead of failing with SQLITE_BUSY.
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON');

/** Adds a column only when missing — idempotent, no silent catch-blocks. */
export function addColumnIfMissing(table: string, column: string, definition: string): void {
  // Table/column names are compile-time constants in migrations — never user input.
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    logger.info(`Migration: added column ${table}.${column}`);
  }
}

export function initializeDatabase(): void {
  logger.info(`SQLite database initialized at ${env.DATABASE_PATH} (WAL mode)`);
}
