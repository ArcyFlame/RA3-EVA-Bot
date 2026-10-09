import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import Database from 'better-sqlite3';

const require = createRequire(import.meta.url);
const updater = require('../../scripts/lib/updater.js');
const { startBot, runHost } = require('../../scripts/host-worker.js');
const sha = 'a'.repeat(40);
const roots: string[] = [];

function githubMock(...responses: unknown[]) {
  const get = vi.fn().mockResolvedValueOnce({ id: 1343222801, full_name: 'ArcyFlame/RA3-EVA-Bot' });
  for (const response of responses) get.mockResolvedValueOnce(response);
  return get;
}

function temporaryRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eva-host-test-'));
  roots.push(root);
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'ra3-community-bot', version: '4.0.1' }),
  );
  return root;
}

function fakeChild() {
  const child = Object.assign(new EventEmitter(), {
    connected: true,
    send: vi.fn(),
    kill: vi.fn(),
  });
  child.send.mockImplementation((message, callback) => {
    if (message.type === 'stop') child.emit('exit', 0);
    callback?.();
  });
  return child;
}

beforeEach(() => {
  vi.stubEnv('DATABASE_PATH', ':memory:');
  vi.stubEnv('AUTO_UPDATE_ENABLED', 'false');
  vi.stubEnv('AUTO_UPDATE_INTERVAL_MINUTES', '360');
  vi.stubEnv('RA3_RECOVER_PENDING', '0');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('stable release trust and version policy', () => {
  it('compares semantic version components without lexicographic mistakes or downgrades', () => {
    expect(updater.newer('4.10.0', '4.9.9')).toBe(true);
    expect(updater.newer('4.0.1', '4.0.1')).toBe(false);
    expect(updater.newer('3.9.9', '4.0.1')).toBe(false);
    for (const value of [
      'v4.0.2',
      '4.0.2-beta',
      '04.0.2',
      '4.0.2/../../',
      '999999999999999999.0.0',
    ])
      expect(() => updater.newer(value, '4.0.1')).toThrow();
  });

  it('pins the repository and release tag to the commit returned by GitHub', async () => {
    const get = githubMock(
      { tag_name: 'v4.0.2', published_at: '2026-10-09', draft: false, prerelease: false },
      { sha },
    );
    expect(await updater.findUpdate('4.0.1', [], get)).toEqual({
      tag: 'v4.0.2',
      version: '4.0.2',
      sha,
    });
    expect(get.mock.calls.map(([url]) => url)).toEqual([
      '/repos/ArcyFlame/RA3-EVA-Bot',
      '/repos/ArcyFlame/RA3-EVA-Bot/releases/latest',
      '/repos/ArcyFlame/RA3-EVA-Bot/commits/v4.0.2',
    ]);
  });

  it('rejects drafts, prereleases, malformed tags and unverified commit shapes', async () => {
    for (const release of [
      { tag_name: 'v4.0.2', draft: true },
      { tag_name: 'v4.0.2', prerelease: true },
      { tag_name: 'v4.0.2-beta' },
      { tag_name: '../../main' },
    ])
      await expect(
        updater.findUpdate('4.0.1', [], githubMock({ published_at: '2026-10-09', ...release })),
      ).rejects.toThrow();
    await expect(
      updater.findUpdate(
        '4.0.1',
        [],
        githubMock(
          { tag_name: 'v4.0.2', published_at: '2026-10-09' },
          { sha: '--upload-pack=bad' },
        ),
      ),
    ).rejects.toThrow('verified');
  });

  it('ignores unavailable, older and already-failed releases', async () => {
    expect(await updater.findUpdate('4.0.1', [], githubMock(null))).toBeNull();
    expect(
      await updater.findUpdate(
        '4.0.1',
        [],
        githubMock({ tag_name: 'v3.0.0', published_at: '2026-10-09' }),
      ),
    ).toBeNull();
    const get = githubMock({ tag_name: 'v4.0.2', published_at: '2026-10-09' }, { sha });
    expect(await updater.findUpdate('4.0.1', [sha], get)).toBeNull();
  });

  it('rejects a different repository even if its name has been reused', async () => {
    await expect(
      updater.findUpdate(
        '4.0.1',
        [],
        vi.fn().mockResolvedValue({ id: 1, full_name: 'ArcyFlame/RA3-EVA-Bot' }),
      ),
    ).rejects.toThrow('identity changed');
  });

  it('does not pass bot/API credentials or the production database path to builds', () => {
    const env = updater.buildEnvironment({
      PATH: 'tools',
      DISCORD_TOKEN: 'secret',
      CHALLONGE_API_KEY: 'secret',
      GITHUB_TOKEN: 'secret',
      DATABASE_PATH: '/production/bot.db',
      NODE_OPTIONS: '--require malicious',
    });
    expect(env.PATH).toBe('tools');
    expect(env.DISCORD_TOKEN).toMatch(/^test-token/);
    expect(env.DATABASE_PATH).toBe(':memory:');
    expect(env.CHALLONGE_API_KEY).toBeUndefined();
    expect(env.GITHUB_TOKEN).toBeUndefined();
    expect(env.NODE_OPTIONS).toBeUndefined();
  });

  it('refuses changed tags before checkout, install or any active-code changes', async () => {
    const location = updater.paths(temporaryRoot());
    const run = vi
      .fn()
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('b'.repeat(40));
    await expect(
      updater.stageRelease(location, { sha, version: '4.0.2', tag: 'v4.0.2' }, run),
    ).rejects.toThrow('changed');
    expect(run).toHaveBeenCalledTimes(3);
    expect(fs.readdirSync(location.releases)).toEqual([]);
    expect(fs.readFileSync(path.join(location.root, 'package.json'), 'utf8')).toContain('4.0.1');
  });

  it('rejects command/path injection before running git', async () => {
    const run = vi.fn();
    await expect(
      updater.stageRelease(
        updater.paths(temporaryRoot()),
        { sha, version: '4.0.2', tag: '--upload-pack=evil' },
        run,
      ),
    ).rejects.toThrow('reference');
    expect(run).not.toHaveBeenCalled();
  });

  it('requires matching package, schema, protocol and integrity-pinned registry dependencies', () => {
    const root = temporaryRoot();
    const manifest = {
      name: 'ra3-community-bot',
      version: '4.0.2',
      botUpdater: { protocol: 1, schemaVersion: 33 },
      engines: { node: '>=22.12.0' },
    };
    const lock = {
      version: '4.0.2',
      lockfileVersion: 3,
      packages: {
        '': {},
        'node_modules/example': {
          resolved: 'https://registry.npmjs.org/example/-/example.tgz',
          integrity: 'sha512-YWJjZA==',
        },
      },
    };
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest));
    fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify(lock));
    expect(() => updater.validatePackage(root, '4.0.2')).not.toThrow();
    expect(() => updater.validatePackage(root, '4.0.3')).toThrow('mismatch');
    lock.packages['node_modules/example'].resolved = 'git+ssh://attacker/example';
    fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify(lock));
    expect(() => updater.validatePackage(root, '4.0.2')).toThrow('integrity');
  });
});

describe('persisted update state and database rollback', () => {
  it('rejects release/backup traversal and protocol mismatches', () => {
    const location = updater.paths(temporaryRoot());
    expect(() => updater.releaseDirectory(location, '../../')).toThrow();
    expect(() => updater.restoreDatabase(location, '../other.db', Database)).toThrow();
    updater.atomicJson(location.state, {
      protocol: 1,
      active: '../x',
      version: '4.0.1',
      failed: [],
      pending: null,
    });
    expect(() => updater.readState(location, '4.0.1')).toThrow('state');
    updater.atomicJson(location.state, {
      protocol: 2,
      active: null,
      version: '4.0.1',
      failed: [],
      pending: null,
    });
    expect(() => updater.readState(location, '4.0.1')).toThrow('state');
  });

  it('backs up a WAL database and restores it after a failed migration', async () => {
    const root = temporaryRoot();
    const database = path.join(root, 'live.db');
    vi.stubEnv('DATABASE_PATH', database);
    const db = new Database(database);
    db.pragma('journal_mode = WAL');
    db.exec("CREATE TABLE players (name TEXT); INSERT INTO players VALUES ('Original')");
    const location = updater.paths(root);
    const backup = await updater.snapshotDatabase(location, Database);
    db.exec(
      "ALTER TABLE players ADD COLUMN extra TEXT; DELETE FROM players; INSERT INTO players VALUES ('Candidate', NULL)",
    );
    db.close();
    updater.restoreDatabase(location, backup, Database);
    const restored = new Database(database);
    expect(restored.prepare('SELECT name FROM players').get()).toEqual({ name: 'Original' });
    expect(restored.prepare('PRAGMA table_info(players)').all()).toHaveLength(1);
    expect(restored.pragma('quick_check', { simple: true })).toBe('ok');
    restored.close();
  });

  it('never treats an in-memory database as a restorable production installation', () => {
    expect(() => updater.databasePath(temporaryRoot())).toThrow('persistent');
  });

  it('rolls back a failed candidate before normal work and marks its commit as failed', async () => {
    const root = temporaryRoot();
    vi.stubEnv('DATABASE_PATH', path.join(root, 'live.db'));
    const database = new Database(process.env.DATABASE_PATH!);
    database.exec("CREATE TABLE players (name TEXT); INSERT INTO players VALUES ('Original')");
    const location = updater.paths(root);
    const backup = await updater.snapshotDatabase(location, Database);
    database.exec("DELETE FROM players; INSERT INTO players VALUES ('Changed')");
    database.close();
    fs.mkdirSync(path.join(location.releases, sha));
    updater.atomicJson(location.state, {
      protocol: 1,
      active: null,
      version: '4.0.1',
      failed: [],
      pending: {
        sha,
        version: '4.0.2',
        previous: null,
        backup,
        database: process.env.DATABASE_PATH,
      },
    });
    const activation = vi.fn();
    const launch = vi.fn().mockReturnValue({
      healthy: Promise.reject(new Error('startup failed')),
      exited: Promise.resolve(1),
      activate: activation,
      stop: vi.fn(),
    });
    expect(await runHost({ root, startBot: launch, sleep: vi.fn(), log: vi.fn() })).toBe(75);
    expect(activation).not.toHaveBeenCalled();
    expect(updater.readState(location, '4.0.1')).toMatchObject({
      active: null,
      pending: null,
      version: '4.0.1',
      failed: [sha],
    });
    const restored = new Database(process.env.DATABASE_PATH!);
    expect(restored.prepare('SELECT name FROM players').get()).toEqual({ name: 'Original' });
    restored.close();
  });

  it('commits a healthy candidate before enabling guild work', async () => {
    const root = temporaryRoot();
    vi.stubEnv('DATABASE_PATH', path.join(root, 'live.db'));
    const location = updater.paths(root);
    fs.mkdirSync(path.join(location.releases, sha));
    updater.atomicJson(location.state, {
      protocol: 1,
      active: null,
      version: '4.0.1',
      failed: [],
      pending: {
        sha,
        version: '4.0.2',
        previous: null,
        backup: `db-1-${'a'.repeat(16)}.db`,
        database: process.env.DATABASE_PATH,
      },
    });
    const activate = vi.fn(() =>
      expect(updater.readState(location, '4.0.1')).toMatchObject({
        active: sha,
        pending: null,
        version: '4.0.2',
      }),
    );
    const launch = vi.fn().mockReturnValue({
      healthy: Promise.resolve(),
      exited: Promise.resolve(64),
      activate,
      stop: vi.fn(),
    });
    expect(await runHost({ root, startBot: launch, sleep: vi.fn(), log: vi.fn() })).toBe(64);
    expect(activate).toHaveBeenCalledOnce();
  });

  it('refuses recovery when the configured database changed mid-update', async () => {
    const root = temporaryRoot();
    vi.stubEnv('RA3_RECOVER_PENDING', '1');
    vi.stubEnv('DATABASE_PATH', path.join(root, 'new.db'));
    const location = updater.paths(root);
    updater.atomicJson(location.state, {
      protocol: 1,
      active: null,
      version: '4.0.1',
      failed: [],
      pending: {
        sha,
        version: '4.0.2',
        previous: null,
        backup: `db-1-${'a'.repeat(16)}.db`,
        database: path.join(root, 'old.db'),
      },
    });
    const launch = vi.fn();
    await expect(runHost({ root, startBot: launch, sleep: vi.fn(), log: vi.fn() })).rejects.toThrow(
      'DATABASE_PATH changed',
    );
    expect(launch).not.toHaveBeenCalled();
    expect(updater.readState(location, '4.0.1').pending).not.toBeNull();
  });
});

describe('private process supervision', () => {
  it('terminates only its owned preparation process on timeout', async () => {
    await expect(
      updater.run(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], temporaryRoot(), 100),
    ).rejects.toThrow(/timeout|timed out/);
  }, 15000);

  it('cancels an owned preparation process when the host stops', async () => {
    const abort = new AbortController();
    const pending = updater.run(
      process.execPath,
      ['-e', 'setInterval(() => {}, 1000)'],
      temporaryRoot(),
      10000,
      updater.buildEnvironment(),
      abort.signal,
    );
    const rejected = expect(pending).rejects.toThrow(/cancelled/);
    abort.abort();
    await rejected;
  }, 15000);

  it('checks free disk and container memory before staging an update', () => {
    const location = updater.paths(temporaryRoot());
    const sufficient = {
      statfs: () => ({ bavail: 2 * 1024 ** 3, bsize: 1 }),
      freemem: () => 8 * 1024 ** 3,
      readFile: () => {
        throw new Error('No cgroup');
      },
    };
    expect(() => updater.assertUpdateCapacity(location, sufficient)).not.toThrow();
    expect(() =>
      updater.assertUpdateCapacity(location, {
        ...sufficient,
        statfs: () => ({ bavail: 1024, bsize: 1 }),
      }),
    ).toThrow('free disk');
    expect(() =>
      updater.assertUpdateCapacity(location, {
        ...sufficient,
        readFile: (file: string) =>
          file.endsWith('memory.max') ? String(512 * 1024 ** 2) : '100000000',
      }),
    ).toThrow('available RAM');
  });

  it('requires a ready handshake and probation before activation', async () => {
    vi.useFakeTimers();
    const root = temporaryRoot();
    vi.stubEnv('DATABASE_PATH', path.join(root, 'live.db'));
    const child = fakeChild();
    const fork = vi.fn().mockReturnValue(child);
    const bot = startBot(root, root, process.env, fork);
    const healthy = vi.fn();
    bot.healthy.then(healthy);
    child.emit('message', { type: 'not-ready' });
    await vi.advanceTimersByTimeAsync(15000);
    expect(healthy).not.toHaveBeenCalled();
    child.emit('message', { type: 'bot-ready' });
    await vi.advanceTimersByTimeAsync(15000);
    expect(healthy).toHaveBeenCalledOnce();
    bot.activate();
    expect(child.send).toHaveBeenCalledWith({ type: 'activate' }, expect.any(Function));
    expect(fork.mock.calls[0][2]).toMatchObject({
      cwd: root,
      windowsHide: true,
      env: { RA3_UPDATE_PROBATION: '1' },
    });
    await bot.stop();
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('does not activate crashed or timed-out candidates', async () => {
    vi.useFakeTimers();
    const root = temporaryRoot();
    vi.stubEnv('DATABASE_PATH', path.join(root, 'live.db'));
    const child = fakeChild();
    const bot = startBot(root, root, process.env, () => child);
    const rejected = expect(bot.healthy).rejects.toThrow('startup timed out');
    await vi.advanceTimersByTimeAsync(90000);
    await rejected;
    expect(() => bot.activate()).toThrow();
    await bot.stop();
  });

  it('honors owner shutdown rather than resurrecting the bot', async () => {
    const root = temporaryRoot();
    vi.stubEnv('DATABASE_PATH', path.join(root, 'live.db'));
    const bot = {
      healthy: Promise.resolve(),
      exited: Promise.resolve(64),
      activate: vi.fn(),
      stop: vi.fn(),
    };
    const launch = vi.fn().mockReturnValue(bot);
    expect(await runHost({ root, startBot: launch, sleep: vi.fn(), log: vi.fn() })).toBe(64);
    expect(launch).toHaveBeenCalledOnce();
  });

  it('restarts on request, but bounds repeated unexpected crashes', async () => {
    const root = temporaryRoot();
    vi.stubEnv('DATABASE_PATH', path.join(root, 'live.db'));
    const launch = vi
      .fn()
      .mockReturnValueOnce({
        healthy: Promise.resolve(),
        exited: Promise.resolve(0),
        activate: vi.fn(),
        stop: vi.fn(),
      })
      .mockReturnValue({
        healthy: Promise.resolve(),
        exited: Promise.resolve(1),
        activate: vi.fn(),
        stop: vi.fn(),
      });
    await expect(runHost({ root, startBot: launch, sleep: vi.fn(), log: vi.fn() })).rejects.toThrow(
      'crash loop',
    );
    expect(launch).toHaveBeenCalledTimes(6);
  });
});
