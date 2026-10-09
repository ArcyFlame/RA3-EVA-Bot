'use strict';

// Rehearse migrations on a disposable snapshot, never the live database.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

async function validate(snapshot) {
  if (!snapshot || !fs.statSync(snapshot).isFile())
    throw new Error('A database snapshot is required');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'eva-migration-check-'));
  const copy = path.join(temporary, 'check.db');
  fs.copyFileSync(snapshot, copy);
  process.env.DATABASE_PATH = copy;
  process.env.DISCORD_TOKEN = 'test-token-0000000000000000';
  try {
    const { connectDatabase, LATEST_SCHEMA_VERSION } = require('../dist/database/connection');
    const { db } = require('../dist/database/sqlite');
    try {
      const manifest = require('../package.json');
      if (manifest.botUpdater?.schemaVersion !== LATEST_SCHEMA_VERSION)
        throw new Error('Release schema declaration does not match its migrations');
      await connectDatabase();
      if (db.pragma('quick_check', { simple: true }) !== 'ok')
        throw new Error('Migrated database failed integrity checks');
      require('canvas').createCanvas(4, 4).toBuffer('image/png');
      console.log(`Migration rehearsal passed at schema ${LATEST_SCHEMA_VERSION}`);
    } finally {
      db.close();
    }
  } finally {
    for (const name of ['check.db', 'check.db-wal', 'check.db-shm']) {
      const file = path.join(temporary, name);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    fs.rmdirSync(temporary);
  }
}

if (require.main === module)
  validate(process.argv[2]).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { validate };
