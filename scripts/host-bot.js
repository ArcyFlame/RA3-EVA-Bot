'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { fork } = require('node:child_process');
const updater = require('./lib/updater');

async function main() {
  const root = path.resolve(__dirname, '..');
  const location = updater.paths(root);
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const nonce = crypto.randomBytes(16).toString('hex');
  if (fs.existsSync(location.botLock)) {
    const previous = JSON.parse(fs.readFileSync(location.botLock, 'utf8'));
    if (!Number.isSafeInteger(previous.pid) || previous.pid < 1)
      throw new Error('Invalid bot lock');
    let alive = true;
    try {
      process.kill(previous.pid, 0);
    } catch (error) {
      if (error.code === 'ESRCH') alive = false;
    }
    if (alive) throw new Error('Previous bot child is still running; wait for it to stop');
    fs.unlinkSync(location.botLock);
  }
  if (fs.existsSync(location.lock)) {
    const previous = JSON.parse(fs.readFileSync(location.lock, 'utf8'));
    if (!Number.isSafeInteger(previous.pid) || previous.pid < 1)
      throw new Error('Invalid host lock');
    let alive = true;
    try {
      process.kill(previous.pid, 0);
    } catch (error) {
      if (error.code === 'ESRCH') alive = false;
    }
    if (alive) throw new Error('This installation already has a managed host running');
    fs.unlinkSync(location.lock);
  }
  fs.writeFileSync(location.lock, JSON.stringify({ pid: process.pid, nonce }), {
    flag: 'wx',
    mode: 0o600,
  });
  let worker;
  let stopping = false;
  const stop = () => {
    stopping = true;
    updater.atomicJson(location.stop, { nonce });
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  let recovering = false;
  try {
    while (!stopping) {
      const state = updater.readState(location, version);
      let selected = recovering ? state.active : (state.pending?.sha ?? state.active);
      let directory;
      try {
        directory = updater.releaseDirectory(location, selected);
      } catch (error) {
        if (!state.pending || recovering) throw error;
        recovering = true;
        selected = state.active;
        directory = updater.releaseDirectory(location, selected);
      }
      worker = fork(path.join(directory, 'scripts/host-worker.js'), [], {
        cwd: root,
        windowsHide: true,
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
        env: {
          ...process.env,
          RA3_HOST_ROOT: root,
          RA3_HOST_NONCE: nonce,
          RA3_RECOVER_PENDING: recovering ? '1' : '0',
        },
      });
      let botPid;
      worker.on('message', (message) => {
        if (message?.type === 'bot-child' && Number.isSafeInteger(message.pid) && message.pid > 0)
          botPid = message.pid;
      });
      const code = await new Promise((resolve) => {
        worker.once('error', () => {
          if (!worker.pid) resolve(1);
        });
        worker.once('exit', (value) => resolve(value ?? 1));
      });
      // A crashed worker closes IPC, which asks its child to stop. Confirm that
      // shutdown before starting another worker or restoring the database.
      if (botPid) {
        const deadline = Date.now() + 20_000;
        let stopped = false;
        while (Date.now() < deadline) {
          let alive = true;
          try {
            process.kill(botPid, 0);
          } catch (error) {
            if (error.code === 'ESRCH') alive = false;
          }
          if (!alive) {
            stopped = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        if (!stopped) throw new Error('Previous child did not stop; refusing database recovery');
      }
      if (stopping || code === 64) return 0;
      if (code === 75) {
        recovering = false;
        continue;
      }
      const current = updater.readState(location, version);
      if (current.pending && !recovering) {
        console.error('[host] Candidate host failed; returning to the previous release');
        recovering = true;
        continue;
      }
      return 1;
    }
    return 0;
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    // Never remove another host's lock or stop request.
    if (
      fs.existsSync(location.lock) &&
      JSON.parse(fs.readFileSync(location.lock, 'utf8')).nonce === nonce
    )
      fs.unlinkSync(location.lock);
    if (
      fs.existsSync(location.stop) &&
      JSON.parse(fs.readFileSync(location.stop, 'utf8')).nonce === nonce
    )
      fs.unlinkSync(location.stop);
  }
}

if (require.main === module)
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`[host] ${error.message}`);
      process.exitCode = 1;
    });
module.exports = { main };
