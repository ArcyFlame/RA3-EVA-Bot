'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { fork } = require('node:child_process');
const updater = require('./lib/updater');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (message) => console.log(`[host] ${message}`);

function startBot(directory, root, environment = process.env, createChild = fork) {
  const child = createChild(path.join(directory, 'dist/index.js'), [], {
    cwd: root,
    windowsHide: true,
    env: { ...environment, DATABASE_PATH: updater.databasePath(root), RA3_UPDATE_PROBATION: '1' },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  let ready = false;
  let closed = false;
  const exited = new Promise((resolve) => {
    child.once('error', () => {
      // An IPC error is not proof that a running process released SQLite.
      if (!child.pid) {
        closed = true;
        resolve(1);
      }
    });
    child.once('exit', (code) => {
      closed = true;
      resolve(code ?? 1);
    });
  });
  const healthy = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Bot startup timed out')), 90_000);
    const probation = { timer: null };
    const finish = () => {
      clearTimeout(timer);
      clearTimeout(probation.timer);
    };
    child.on('message', (message) => {
      if (message?.type !== 'bot-ready' || ready) return;
      ready = true;
      probation.timer = setTimeout(() => {
        finish();
        resolve();
      }, 15_000);
    });
    exited.then(() => {
      finish();
      reject(new Error('Bot exited before activation'));
    });
  });
  // The supervisor awaits health immediately; stopping during probation must not reject unhandled.
  healthy.catch(() => {});
  return {
    child,
    healthy,
    exited,
    activate() {
      if (closed || !ready) throw new Error('Cannot activate a closed bot');
      child.send({ type: 'activate' }, (error) => {
        if (error) child.kill('SIGKILL');
      });
    },
    async stop() {
      if (closed) return;
      if (child.connected) child.send({ type: 'stop' }, () => {});
      const timer = setTimeout(() => child.kill('SIGKILL'), 12_000);
      await exited;
      clearTimeout(timer);
    },
  };
}

async function runHost(options = {}) {
  const root = options.root || process.env.RA3_HOST_ROOT || path.resolve(__dirname, '..');
  require('dotenv').config({ path: path.join(root, '.env') });
  const location = updater.paths(root);
  const rootVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  let state = updater.readState(location, rootVersion);
  let stopping = false;
  let bot = null;
  let updateAbort = null;
  const Database = options.Database || require('better-sqlite3');
  const launch = options.startBot || startBot;
  const pause = options.sleep || sleep;
  const healthLog = options.log || log;
  const stop = () => {
    stopping = true;
    updateAbort?.abort();
    if (bot) void bot.stop();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  process.on('disconnect', stop);
  const stopPoll = setInterval(() => {
    if (!fs.existsSync(location.stop)) return;
    try {
      const request = JSON.parse(fs.readFileSync(location.stop, 'utf8'));
      if (request.nonce === process.env.RA3_HOST_NONCE) stop();
    } catch {
      /* A partial or invalid request is not authority to stop the host. */
    }
  }, 1000);

  const rollback = () => {
    if (!state.pending) return;
    if (state.pending.database !== updater.databasePath(root))
      throw new Error('DATABASE_PATH changed during an update; manual recovery required');
    updater.restoreDatabase(location, state.pending.backup, Database);
    state.failed = [...new Set([...state.failed, state.pending.sha])].slice(-20);
    state.pending = null;
    updater.atomicJson(location.state, state);
    healthLog('Startup update failed; previous database and release restored');
  };

  try {
    if (process.env.RA3_RECOVER_PENDING === '1') rollback();
    const enabled = process.env.AUTO_UPDATE_ENABLED === 'true';
    const rawMinutes = process.env.AUTO_UPDATE_INTERVAL_MINUTES || '360';
    const minutes = Number(rawMinutes);
    if (
      !/^\d+$/.test(rawMinutes) ||
      !Number.isSafeInteger(minutes) ||
      minutes < 60 ||
      minutes > 10080
    )
      throw new Error('AUTO_UPDATE_INTERVAL_MINUTES must be 60–10080');
    if (
      process.env.AUTO_UPDATE_ENABLED &&
      !['true', 'false'].includes(process.env.AUTO_UPDATE_ENABLED)
    )
      throw new Error('AUTO_UPDATE_ENABLED must be true or false');
    let nextCheck = Date.now() + 30_000;
    const crashes = [];
    healthLog(
      `Stable-release updates ${enabled ? 'enabled' : 'disabled'}; interval ${minutes} minutes`,
    );

    while (!stopping) {
      const selected = state.pending?.sha ?? state.active;
      const directory = updater.releaseDirectory(location, selected);
      if (state.pending && state.pending.database !== updater.databasePath(root))
        throw new Error('DATABASE_PATH changed during an update; refusing candidate startup');
      bot = launch(directory, root);
      if (bot.child?.pid) {
        updater.atomicJson(location.botLock, {
          pid: bot.child.pid,
          nonce: process.env.RA3_HOST_NONCE,
        });
        process.send?.({ type: 'bot-child', pid: bot.child.pid });
      }
      try {
        await bot.healthy;
      } catch (error) {
        await bot.stop();
        if (stopping) return 64;
        if (state.pending) {
          rollback();
          return 75;
        }
        crashes.push(Date.now());
        if (crashes.filter((time) => time > Date.now() - 10 * 60_000).length >= 5) throw error;
        healthLog('Startup failed; retrying with a bounded delay');
        await pause(Math.min(30_000, 1000 * 2 ** crashes.length));
        continue;
      }
      if (stopping) {
        await bot.stop();
        return 64;
      }
      if (state.pending) {
        state.active = state.pending.sha;
        state.version = state.pending.version;
        state.pending = null;
        state.updatedAt = new Date().toISOString();
        updater.atomicJson(location.state, state);
        healthLog(`Activated stable release v${state.version}`);
      }
      bot.activate();
      healthLog(`Bot running: v${state.version}`);
      let exited = false;
      let exitCode;
      bot.exited.then((code) => {
        exited = true;
        exitCode = code;
        updateAbort?.abort();
      });
      while (!stopping && !exited) {
        if (enabled && Date.now() >= nextCheck) {
          nextCheck = Date.now() + minutes * 60_000;
          let release;
          updateAbort = new AbortController();
          const execute = (file, args, cwd, timeout) =>
            updater.run(file, args, cwd, timeout, updater.buildEnvironment(), updateAbort.signal);
          try {
            release = await updater.findUpdate(state.version, state.failed, (endpoint) =>
              updater.githubJson(endpoint, updateAbort.signal),
            );
            state.checkedAt = new Date().toISOString();
            updater.atomicJson(location.state, state);
            if (!release) healthLog('No newer stable release available');
            else {
              updater.assertUpdateCapacity(location);
              healthLog(`Preparing v${release.version}; the current bot stays online`);
              const candidate = await updater.stageRelease(location, release, execute);
              const rehearsal = await updater.snapshotDatabase(location, Database);
              await execute(
                process.execPath,
                [
                  path.join(candidate, 'scripts/validate-update.js'),
                  path.join(location.backups, rehearsal),
                ],
                candidate,
              );
              if (stopping || exited) continue;
              await bot.stop();
              const backup = await updater.snapshotDatabase(location, Database);
              if (stopping) return 64;
              state.pending = {
                ...release,
                previous: state.active,
                backup,
                database: updater.databasePath(root),
              };
              updater.atomicJson(location.state, state);
              return 75;
            }
          } catch (error) {
            if (release && error.code !== 'UPDATE_RESOURCES' && !updateAbort.signal.aborted)
              state.failed = [...new Set([...state.failed, release.sha])].slice(-20);
            state.lastError = error.message;
            updater.atomicJson(location.state, state);
            healthLog(`Update skipped: ${error.message}`);
          } finally {
            updateAbort = null;
          }
        }
        await pause(1000);
      }
      if (stopping || exitCode === 64) {
        await bot.stop();
        return 64;
      }
      if (exitCode !== 0) {
        crashes.push(Date.now());
        if (crashes.filter((time) => time > Date.now() - 10 * 60_000).length >= 5)
          throw new Error('Repeated bot failures; host stopped to prevent a crash loop');
      }
      await pause(Math.min(30_000, 1000 * 2 ** Math.min(crashes.length, 5)));
    }
    return 64;
  } finally {
    clearInterval(stopPoll);
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    process.removeListener('disconnect', stop);
    if (bot) await bot.stop();
    if (fs.existsSync(location.botLock)) {
      const lock = JSON.parse(fs.readFileSync(location.botLock, 'utf8'));
      if (lock.nonce === process.env.RA3_HOST_NONCE) fs.unlinkSync(location.botLock);
    }
  }
}

if (require.main === module)
  runHost()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(`[host] ${error.message}`);
      process.exit(1);
    });
module.exports = { startBot, runHost };
