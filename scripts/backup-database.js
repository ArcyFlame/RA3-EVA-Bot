'use strict';
require('dotenv').config();
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

(async () => {
  const source = path.resolve(process.env.DATABASE_PATH?.trim() || './data/bot.db');
  const directory = path.resolve(__dirname, '../data/backups');
  fs.mkdirSync(directory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destination = path.join(directory, `bot-${stamp}-${process.pid}.db`);
  if (fs.existsSync(destination)) throw new Error('The backup file already exists.');
  const database = new Database(source, { readonly: true, fileMustExist: true });
  try {
    await database.backup(destination);
    const backup = new Database(destination, { readonly: true, fileMustExist: true });
    try {
      if (backup.pragma('quick_check', { simple: true }) !== 'ok') {
        throw new Error('The backup did not pass SQLite integrity checks.');
      }
    } finally {
      backup.close();
    }
    console.log(`Database backup saved: ${destination}`);
  } finally {
    database.close();
  }
})().catch((error) => {
  console.error('Database backup failed:', error.message);
  process.exitCode = 1;
});
