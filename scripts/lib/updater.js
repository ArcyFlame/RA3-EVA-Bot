'use strict';

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const os = require('node:os');
const { spawn } = require('node:child_process');

const REPOSITORY = 'ArcyFlame/RA3-EVA-Bot';
const REPOSITORY_ID = 1343222801;
const REMOTE = `https://github.com/${REPOSITORY}.git`;
const SHA = /^[a-f0-9]{40}$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const BACKUP = /^db-\d+-[a-f0-9]{16}\.db$/;

function newer(version, installed) {
  if (!VERSION.test(version) || !VERSION.test(installed)) throw new Error('Invalid stable version');
  const left = version.split('.').map(Number);
  const right = installed.split('.').map(Number);
  if (![...left, ...right].every(Number.isSafeInteger)) throw new Error('Version is out of range');
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i];
  return false;
}

function directory(parent, name) {
  const resolvedParent = fs.realpathSync(parent);
  const target = path.join(resolvedParent, name);
  fs.mkdirSync(target, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(target).isSymbolicLink() || fs.realpathSync(target) !== target)
    throw new Error('Managed directories must not be symlinks');
  return target;
}

function paths(root) {
  root = fs.realpathSync(root);
  const updates = directory(root, '.updates');
  return {
    root,
    updates,
    releases: directory(updates, 'releases'),
    backups: directory(updates, 'backups'),
    state: path.join(updates, 'state.json'),
    lock: path.join(updates, 'host.lock'),
    botLock: path.join(updates, 'bot.lock'),
    stop: path.join(updates, 'stop.json'),
  };
}

function atomicJson(file, data) {
  const temporary = `${file}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2), { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function readState(location, version) {
  if (!fs.existsSync(location.state))
    return { protocol: 1, active: null, version, pending: null, failed: [] };
  const state = JSON.parse(fs.readFileSync(location.state, 'utf8'));
  const validRef = (value) => value === null || (typeof value === 'string' && SHA.test(value));
  if (
    state.protocol !== 1 ||
    !validRef(state.active) ||
    !VERSION.test(state.version) ||
    !Array.isArray(state.failed) ||
    state.failed.length > 20 ||
    state.failed.some((value) => !SHA.test(value)) ||
    (state.pending !== null &&
      (!state.pending ||
        !SHA.test(state.pending.sha) ||
        !validRef(state.pending.previous) ||
        state.pending.previous !== state.active ||
        !VERSION.test(state.pending.version) ||
        !BACKUP.test(state.pending.backup) ||
        typeof state.pending.database !== 'string' ||
        !path.isAbsolute(state.pending.database)))
  )
    throw new Error('Invalid updater state; refusing to select a release');
  return state;
}

function releaseDirectory(location, sha) {
  if (sha === null) return location.root;
  if (typeof sha !== 'string' || !SHA.test(sha)) throw new Error('Invalid release identifier');
  const target = path.join(location.releases, sha);
  if (fs.lstatSync(target).isSymbolicLink() || fs.realpathSync(target) !== target)
    throw new Error('Release directory escaped managed storage');
  return target;
}

function githubJson(endpoint, signal) {
  if (endpoint !== `/repos/${REPOSITORY}` && !endpoint.startsWith(`/repos/${REPOSITORY}/`))
    throw new Error('Untrusted release endpoint');
  return new Promise((resolve, reject) => {
    const request = https.get(
      {
        hostname: 'api.github.com',
        signal,
        path: endpoint,
        headers: {
          'User-Agent': 'RA3-EVA-Bot-updater',
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        timeout: 15_000,
      },
      (response) => {
        let text = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          text += chunk;
          if (Buffer.byteLength(text) > 1024 * 1024)
            request.destroy(new Error('Release response too large'));
        });
        response.on('error', reject);
        response.on('end', () => {
          if (response.statusCode === 404) return resolve(null);
          if (response.statusCode !== 200)
            return reject(
              new Error(`GitHub release check failed (${response.statusCode}); current bot kept`),
            );
          try {
            resolve(JSON.parse(text));
          } catch {
            reject(new Error('Invalid GitHub release response'));
          }
        });
      },
    );
    request.on('timeout', () => request.destroy(new Error('GitHub release check timed out')));
    request.on('error', reject);
  });
}

async function findUpdate(installed, failed = [], get = githubJson) {
  const repository = await get(`/repos/${REPOSITORY}`);
  if (repository?.id !== REPOSITORY_ID || repository.full_name !== REPOSITORY)
    throw new Error('Trusted repository identity changed; automatic update refused');
  const release = await get(`/repos/${REPOSITORY}/releases/latest`);
  if (!release) return null;
  if (
    release.draft ||
    release.prerelease ||
    !release.published_at ||
    typeof release.tag_name !== 'string' ||
    !/^v\d+\.\d+\.\d+$/.test(release.tag_name)
  )
    throw new Error('Only published stable version tags may update the bot');
  const version = release.tag_name.slice(1);
  if (!newer(version, installed)) return null;
  const commit = await get(`/repos/${REPOSITORY}/commits/${release.tag_name}`);
  if (!commit || typeof commit.sha !== 'string' || !SHA.test(commit.sha))
    throw new Error('Release commit could not be verified');
  if (failed.includes(commit.sha)) return null;
  return { version, tag: release.tag_name, sha: commit.sha };
}

function buildEnvironment(environment = process.env) {
  const result = {};
  for (const key of [
    'PATH',
    'Path',
    'SystemRoot',
    'WINDIR',
    'TEMP',
    'TMP',
    'HOME',
    'USERPROFILE',
    'APPDATA',
    'LOCALAPPDATA',
    'COMSPEC',
    'PATHEXT',
  ])
    if (environment[key] !== undefined) result[key] = environment[key];
  return {
    ...result,
    CI: 'true',
    NODE_ENV: 'development',
    DATABASE_PATH: ':memory:',
    DISCORD_TOKEN: 'test-token-0000000000000000',
    GIT_TERMINAL_PROMPT: '0',
  };
}

function run(file, args, cwd, timeout = 120_000, environment = buildEnvironment(), signal) {
  const command = /npm-cli\.js$/.test(args[0] || '')
    ? `npm ${args.slice(1, 3).join(' ')}`
    : `${path.basename(file)} ${args[0] || ''}`;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Update preparation cancelled'));
    const child = spawn(file, args, {
      cwd,
      env: environment,
      shell: false,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let timedOut = false;
    let termination = Promise.resolve();
    const terminate = () => {
      if (timedOut) return;
      timedOut = true;
      termination = (async () => {
        if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
        if (process.platform === 'win32') {
          await new Promise((done) => {
            const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
              windowsHide: true,
              shell: false,
              stdio: 'ignore',
            });
            const deadline = setTimeout(() => {
              killer.kill();
              done();
            }, 10_000);
            const complete = () => {
              clearTimeout(deadline);
              done();
            };
            killer.once('error', complete);
            killer.once('exit', complete);
          });
        } else {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch (error) {
            if (error.code !== 'ESRCH') reject(error);
          }
        }
      })();
      termination.then(() => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', terminate);
        reject(new Error('Update preparation cancelled or timed out'));
      });
    };
    const collect = (chunk) => {
      output = (output + chunk.toString()).slice(-256_000);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    const timer = setTimeout(() => {
      terminate();
    }, timeout);
    signal?.addEventListener('abort', terminate, { once: true });
    child.once('error', (error) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', terminate);
      reject(error);
    });
    child.once('close', async (code) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', terminate);
      await termination;
      if (code === 0 && !timedOut) resolve(output.trim());
      else reject(new Error(`${command} failed${timedOut ? ' (timeout)' : ` (${code})`}`));
    });
  });
}

function npmCommand(args) {
  if (process.platform !== 'win32') return ['npm', args];
  const cli =
    process.env.npm_execpath ||
    path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  if (!cli.endsWith('npm-cli.js') || !fs.existsSync(cli)) throw new Error('Cannot locate npm CLI');
  return [process.execPath, [cli, ...args]];
}

function validatePackage(dir, version) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(dir, 'package-lock.json'), 'utf8'));
  if (
    manifest.name !== 'ra3-community-bot' ||
    manifest.version !== version ||
    manifest.botUpdater?.protocol !== 1 ||
    lock.version !== version ||
    lock.lockfileVersion !== 3
  )
    throw new Error('Release package/version/updater protocol mismatch');
  if (
    !Number.isSafeInteger(manifest.botUpdater.schemaVersion) ||
    manifest.botUpdater.schemaVersion < 1
  )
    throw new Error('Release must declare its database schema version');
  const minimum = manifest.engines?.node?.match(/^>=(\d+\.\d+\.\d+)$/)?.[1];
  if (!minimum || newer(minimum, process.versions.node))
    throw new Error('Release requires a newer Node.js runtime');
  if (!lock.packages || typeof lock.packages !== 'object')
    throw new Error('Missing dependency lockfile');
  for (const [name, entry] of Object.entries(lock.packages)) {
    if (!name) continue;
    if (
      !name.startsWith('node_modules/') ||
      !entry ||
      entry.link ||
      typeof entry.resolved !== 'string' ||
      !entry.resolved.startsWith('https://registry.npmjs.org/') ||
      typeof entry.integrity !== 'string' ||
      !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(entry.integrity)
    )
      throw new Error('Dependency lockfile must use integrity-pinned npm registry packages');
  }
}

function assertUpdateCapacity(location, options = {}) {
  const stat = (options.statfs || fs.statfsSync)(location.updates);
  let memory = (options.freemem || os.freemem)();
  const read = options.readFile || ((file) => fs.readFileSync(file, 'utf8'));
  for (const [limitFile, usedFile] of [
    ['/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory.current'],
    ['/sys/fs/cgroup/memory/memory.limit_in_bytes', '/sys/fs/cgroup/memory/memory.usage_in_bytes'],
  ]) {
    try {
      const limit = read(limitFile).trim();
      const used = read(usedFile).trim();
      if (/^\d+$/.test(limit) && /^\d+$/.test(used)) {
        memory = Math.min(memory, Math.max(0, Number(limit) - Number(used)));
      }
    } catch {
      // Non-container hosts do not expose these cgroup files.
    }
  }
  const disk = Number(stat.bavail) * Number(stat.bsize);
  if (
    !Number.isFinite(disk) ||
    disk < 1024 ** 3 ||
    !Number.isFinite(memory) ||
    memory < 512 * 1024 ** 2
  ) {
    const error = new Error(
      'Update needs at least 1 GiB free disk and 512 MiB available RAM; current bot kept',
    );
    error.code = 'UPDATE_RESOURCES';
    throw error;
  }
}

async function stageRelease(location, release, execute = run) {
  if (
    !SHA.test(release.sha) ||
    !VERSION.test(release.version) ||
    release.tag !== `v${release.version}`
  )
    throw new Error('Invalid release reference');
  const stage = fs.mkdtempSync(path.join(location.updates, `stage-${release.sha.slice(0, 8)}-`));
  const hooks = directory(stage, 'empty-hooks');
  const git = (args) =>
    execute(
      'git',
      ['-c', `core.hooksPath=${hooks}`, '-c', 'protocol.file.allow=never', '-C', stage, ...args],
      location.root,
    );
  await git(['init']);
  await git(['fetch', '--no-tags', '--depth=1', REMOTE, `refs/tags/${release.tag}`]);
  const sha = await git(['rev-parse', 'FETCH_HEAD^{commit}']);
  if (sha.trim() !== release.sha)
    throw new Error('Release tag changed during download; update refused');
  await git(['checkout', '--detach', release.sha]);
  const tracked = await git(['ls-files']);
  if (
    tracked
      .split(/\r?\n/)
      .some(
        (file) =>
          /^(?:\.updates|node_modules|data|logs)(?:\/|$)|^\.env(?:$|\.)/.test(file) &&
          file !== '.env.example',
      )
  )
    throw new Error('Release contains private or runtime files');
  validatePackage(stage, release.version);
  const npm = (args, timeout) => {
    const [file, argv] = npmCommand(args);
    return execute(file, argv, stage, timeout);
  };
  await npm(['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--include=dev'], 10 * 60_000);
  // Only the two native runtime dependencies need install scripts.
  await npm(['rebuild', 'better-sqlite3', 'canvas', '--ignore-scripts=false'], 10 * 60_000);
  await npm(['audit', '--omit=dev', '--audit-level=high'], 120_000);
  await npm(['run', 'build'], 120_000);
  await npm(['run', 'lint'], 120_000);
  await npm(['test'], 120_000);
  await execute(process.execPath, ['--check', 'scripts/host-worker.js'], stage);
  await execute(process.execPath, ['--check', 'scripts/lib/updater.js'], stage);
  for (const file of [
    'dist/index.js',
    'scripts/host-worker.js',
    'scripts/lib/updater.js',
    'scripts/validate-update.js',
  ])
    if (!fs.statSync(path.join(stage, file)).isFile())
      throw new Error(`Release is missing ${file}`);
  const destination = path.join(location.releases, release.sha);
  if (fs.existsSync(destination))
    throw new Error('Release directory already exists; inspect it manually');
  fs.renameSync(stage, destination);
  return destination;
}

function databasePath(root) {
  if (process.env.DATABASE_PATH === ':memory:')
    throw new Error('Automatic updates require a persistent database');
  return path.resolve(root, process.env.DATABASE_PATH?.trim() || './data/bot.db');
}

async function snapshotDatabase(location, Database) {
  const source = databasePath(location.root);
  const name = `db-${Date.now()}-${crypto.randomBytes(8).toString('hex')}.db`;
  const destination = path.join(location.backups, name);
  const database = new Database(source, { readonly: true, fileMustExist: true });
  try {
    await database.backup(destination);
  } finally {
    database.close();
  }
  const backup = new Database(destination, { readonly: true, fileMustExist: true });
  try {
    if (backup.pragma('quick_check', { simple: true }) !== 'ok')
      throw new Error('Backup integrity check failed');
  } finally {
    backup.close();
  }
  fs.chmodSync(destination, 0o600);
  return name;
}

function restoreDatabase(location, name, Database) {
  if (!BACKUP.test(name)) throw new Error('Invalid database backup reference');
  const source = path.join(location.backups, name);
  if (fs.lstatSync(source).isSymbolicLink()) throw new Error('Backup must not be a symlink');
  const backup = new Database(source, { readonly: true, fileMustExist: true });
  try {
    if (backup.pragma('quick_check', { simple: true }) !== 'ok')
      throw new Error('Cannot restore an invalid backup');
  } finally {
    backup.close();
  }
  const destination = databasePath(location.root);
  // Called only after the bot child is confirmed closed. Never rewind a running database.
  fs.copyFileSync(source, destination);
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = `${destination}${suffix}`;
    if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
  }
}

module.exports = {
  REPOSITORY,
  REPOSITORY_ID,
  REMOTE,
  SHA,
  newer,
  paths,
  atomicJson,
  readState,
  releaseDirectory,
  githubJson,
  findUpdate,
  buildEnvironment,
  run,
  npmCommand,
  validatePackage,
  assertUpdateCapacity,
  stageRelease,
  databasePath,
  snapshotDatabase,
  restoreDatabase,
};
