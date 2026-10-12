import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import Database from 'better-sqlite3';

const require = createRequire(import.meta.url);
const { createUpdateControls } = require('../../scripts/lib/update-controls.js');
const { runHost } = require('../../scripts/host-worker.js');
const updater = require('../../scripts/lib/updater.js');
const release = { version: '5.5.0', tag: 'v5.5.0', sha: 'a'.repeat(40) };
const request = (action = 'check', token?: string) => ({
  type: 'bot-update-request',
  id: 'b'.repeat(32),
  action,
  token,
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('manual update confirmations', () => {
  function controller() {
    const state = { version: '5.4.0', failed: [] as string[] };
    const find = vi.fn().mockResolvedValue(release);
    const busy = vi.fn().mockReturnValue(false);
    let now = 0;
    return {
      state,
      find,
      busy,
      advance: () => {
        now += 300_000;
      },
      controls: createUpdateControls({
        getState: () => state,
        findUpdate: find,
        isBusy: busy,
        now: () => now,
      }),
    };
  }
  it('checks without installing and only queues the exact release after confirmation', async () => {
    const { controls } = controller();
    const result = await controls.handle(request());
    expect(result).toMatchObject({ status: 'available', installed: '5.4.0', version: '5.5.0' });
    expect(controls.takeRequested()).toBeNull();
    expect(await controls.handle(request('confirm', 'c'.repeat(32)))).toMatchObject({
      status: 'expired',
    });
    expect(await controls.handle(request('confirm', result.token))).toMatchObject({
      status: 'accepted',
    });
    expect(await controls.handle(request('confirm', result.token))).toMatchObject({
      status: 'busy',
    });
    expect(controls.takeRequested()).toEqual(release);
    expect(controls.takeRequested()).toBeNull();
  });
  it.each(['cancel', 'timeout', 'replacement', 'version'])(
    'rejects a confirmation after %s',
    async (reason) => {
      const { controls, state, advance } = controller();
      const result = await controls.handle(request());
      if (reason === 'cancel') await controls.handle(request('cancel', result.token));
      if (reason === 'timeout') advance();
      if (reason === 'replacement') await controls.handle(request());
      if (reason === 'version') state.version = '5.5.0';
      expect(await controls.handle(request('confirm', result.token))).toMatchObject({
        status: 'expired',
      });
      expect(controls.takeRequested()).toBeNull();
    },
  );
  it('handles missing releases and failures without leaking errors or queuing updates', async () => {
    const { controls, find } = controller();
    find.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('private details'));
    expect(await controls.handle(request())).toMatchObject({ status: 'current' });
    expect(await controls.handle(request())).toEqual({
      type: 'bot-update-response',
      id: 'b'.repeat(32),
      status: 'failed',
    });
    expect(controls.takeRequested()).toBeNull();
    expect(await controls.handle({ ...request(), id: '../bad' })).toBeNull();
  });
  it('reports a previous failed installation without exposing its error details', async () => {
    const controls = createUpdateControls({
      getState: () => ({
        version: '5.4.0',
        failed: [release.sha],
        lastError: 'private error details',
      }),
      findUpdate: vi.fn().mockResolvedValue(null),
      isBusy: () => false,
    });
    const result = await controls.handle(request());
    expect(result).toMatchObject({ status: 'current', lastUpdateFailed: true });
    expect(JSON.stringify(result)).not.toContain('private error details');
  });
  it('blocks overlapping checks and confirmations while the host is preparing an update', async () => {
    const { controls, find, busy } = controller();
    let resolve!: (value: unknown) => void;
    find.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const pending = controls.handle(request());
    expect(await controls.handle(request())).toMatchObject({ status: 'busy' });
    busy.mockReturnValue(true);
    resolve(release);
    expect(await pending).toMatchObject({ status: 'busy' });
    expect(controls.takeRequested()).toBeNull();
  });
});

describe('manual updates through the managed host', () => {
  it.each([false, true])(
    'handles a confirmed request with automatic updates off (changed=%s)',
    async (changed) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eva-manual-update-'));
      try {
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '5.4.0' }));
        vi.stubEnv('DATABASE_PATH', path.join(root, 'live.db'));
        vi.stubEnv('AUTO_UPDATE_ENABLED', 'false');
        vi.stubEnv('AUTO_UPDATE_INTERVAL_MINUTES', '360');
        vi.stubEnv('RA3_RECOVER_PENDING', '0');
        const database = new Database(path.join(root, 'live.db'));
        database.exec('CREATE TABLE test(value TEXT)');
        database.close();
        const location = updater.paths(root);
        vi.spyOn(updater, 'findUpdate')
          .mockResolvedValueOnce(release)
          .mockResolvedValue(changed ? { ...release, sha: 'c'.repeat(40) } : release);
        vi.spyOn(updater, 'assertUpdateCapacity').mockImplementation(() => {});
        const stage = vi.spyOn(updater, 'stageRelease').mockResolvedValue(root);
        const validate = vi.spyOn(updater, 'run').mockResolvedValue('');
        let exit!: (code: number) => void;
        const exited = new Promise<number>((done) => {
          exit = done;
        });
        const child = Object.assign(new EventEmitter(), { connected: true, send: vi.fn() });
        child.send.mockImplementation((message, callback) => {
          if (message.status === 'available')
            child.emit('message', request('confirm', message.token));
          callback?.();
        });
        const bot = {
          child,
          exited,
          healthy: Promise.resolve(),
          activate: () => child.emit('message', request()),
          stop: vi.fn(async () => {
            exit(64);
          }),
        };
        let ticks = 0;
        const log = vi.fn();
        const code = await runHost({
          root,
          startBot: () => bot,
          log,
          sleep: async () => {
            await new Promise((done) => setImmediate(done));
            if (++ticks > 10) process.emit('SIGTERM');
          },
        });
        expect(child.send).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'accepted' }),
          expect.any(Function),
        );
        if (changed) {
          expect(code).toBe(64);
          expect(stage).not.toHaveBeenCalled();
          expect(updater.readState(location, '5.4.0').pending).toBeNull();
          expect(log).toHaveBeenCalledWith(expect.stringContaining('confirmed release changed'));
        } else {
          expect(code).toBe(75);
          expect(stage).toHaveBeenCalledWith(location, release, expect.any(Function));
          expect(validate).toHaveBeenCalled();
          expect(updater.readState(location, '5.4.0')).toMatchObject({
            active: null,
            version: '5.4.0',
            pending: { ...release, previous: null },
          });
          expect(fs.readdirSync(location.backups)).toHaveLength(2);
        }
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
