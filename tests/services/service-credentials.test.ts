import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import axios from 'axios';
import { connectDatabase } from '../../src/database/connection';
import { db } from '../../src/database/sqlite';
import { env } from '../../src/config/env';
import { replaceCredentialOverrides } from '../../src/config/runtime-credentials';
import { ServiceCredentialsService } from '../../src/services/service-credentials.service';
vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
let directory: string;
beforeAll(connectDatabase);
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'eva-credentials-'));
  db.prepare(
    "DELETE FROM app_settings WHERE key='service_credentials:v1' OR key LIKE 'service_status:%'",
  ).run();
  replaceCredentialOverrides({});
  vi.clearAllMocks();
});
afterEach(() => {
  replaceCredentialOverrides({});
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true });
});
const secret = 'private-challonge-key-123456';
function service() {
  return new ServiceCredentialsService(join(directory, 'service-credentials.key'));
}
function payload(): string {
  return (
    db.prepare("SELECT value FROM app_settings WHERE key='service_credentials:v1'").get() as any
  ).value;
}
describe('shared service credential storage', () => {
  it('encrypts credentials, loads them after restart, and keeps blank updates unchanged', () => {
    const first = service();
    first.save('challonge', { CHALLONGE_API_KEY: secret });
    expect(payload()).not.toContain(secret);
    expect(readFileSync(join(directory, 'service-credentials.key')).length).toBe(32);
    expect(env.CHALLONGE_API_KEY).toBe(secret);
    replaceCredentialOverrides({});
    const restarted = service();
    restarted.load();
    expect(restarted.locked).toBe(false);
    expect(env.CHALLONGE_API_KEY).toBe(secret);
    restarted.save('challonge', { CHALLONGE_API_KEY: '' });
    expect(env.CHALLONGE_API_KEY).toBe(secret);
  });
  it.each(['missing-key', 'tampered-ciphertext'])(
    'fails closed without erasing stored data: %s',
    (reason) => {
      service().save('challonge', { CHALLONGE_API_KEY: secret });
      if (reason === 'missing-key') rmSync(join(directory, 'service-credentials.key'));
      else {
        const cipher = JSON.parse(payload());
        cipher.tag = Buffer.alloc(16).toString('base64');
        db.prepare("UPDATE app_settings SET value=? WHERE key='service_credentials:v1'").run(
          JSON.stringify(cipher),
        );
      }
      const previous = payload();
      replaceCredentialOverrides({});
      const restarted = service();
      restarted.load();
      expect(restarted.locked).toBe(true);
      expect(() => restarted.save('challonge', {}, 'disable')).toThrow('locked');
      expect(payload()).toBe(previous);
      expect(env.CHALLONGE_API_KEY).not.toBe(secret);
    },
  );
  it('can disable a host credential and later restore the environment value', () => {
    vi.stubEnv('YOUTUBE_API_KEY', 'host-youtube-12345');
    const current = service();
    current.save('youtube', {}, 'disable');
    expect(env.YOUTUBE_API_KEY).toBeUndefined();
    expect(current.status('youtube')).toBe('disabled');
    current.save('youtube', {}, 'environment');
    expect(env.YOUTUBE_API_KEY).toBe('host-youtube-12345');
    expect(current.status('youtube')).toBe('configured');
  });
  it.each(['short', 'a'.repeat(1025), 'secret\n1234567'])(
    'rejects invalid secret formats without storing them',
    (value) => {
      expect(() => service().save('youtube', { YOUTUBE_API_KEY: value })).toThrow('format');
      expect(
        db.prepare("SELECT value FROM app_settings WHERE key='service_credentials:v1'").get(),
      ).toBeUndefined();
    },
  );
  it('does not call a service without credentials and records invalid and unavailable separately', async () => {
    const current = service();
    expect(await current.check('youtube')).toBe('missing');
    expect(axios.get).not.toHaveBeenCalled();
    current.save('youtube', { YOUTUBE_API_KEY: 'youtube-12345' });
    vi.mocked(axios.get).mockRejectedValueOnce({ response: { status: 401 } });
    expect(await current.check('youtube')).toBe('invalid');
    vi.mocked(axios.get).mockRejectedValueOnce({ response: { status: 503 } });
    expect(await current.check('youtube')).toBe('unavailable');
    vi.mocked(axios.get).mockResolvedValueOnce({ data: {} });
    expect(await current.check('youtube')).toBe('active');
    expect(axios.get).toHaveBeenLastCalledWith(
      expect.stringContaining('googleapis.com'),
      expect.objectContaining({ timeout: 8000, maxRedirects: 0 }),
    );
    expect(
      JSON.stringify(
        db.prepare("SELECT value FROM app_settings WHERE key LIKE 'service_status:%'").all(),
      ),
    ).not.toContain('youtube-12345');
  });
});
