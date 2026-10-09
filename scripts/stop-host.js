'use strict';
const fs = require('node:fs');
const path = require('node:path');
const updater = require('./lib/updater');
try {
  const location = updater.paths(path.resolve(__dirname, '..'));
  const lock = JSON.parse(fs.readFileSync(location.lock, 'utf8'));
  if (!/^[a-f0-9]{32}$/.test(lock.nonce)) throw new Error('Invalid host lock');
  updater.atomicJson(location.stop, { nonce: lock.nonce });
  console.log('Graceful stop requested for this installation.');
} catch (error) {
  console.error(
    `Cannot request a stop: ${error.code === 'ENOENT' ? 'no managed host is running' : error.message}`,
  );
  process.exitCode = 1;
}
