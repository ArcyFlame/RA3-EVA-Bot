import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import axios from 'axios';
import { db } from '../database/sqlite';
import { env } from '../config/env';
import {
  CREDENTIAL_KEYS,
  CredentialKey,
  configuredCredential,
  replaceCredentialOverrides,
} from '../config/runtime-credentials';

export const SERVICE_FIELDS = {
  challonge: ['CHALLONGE_API_KEY', 'CHALLONGE_SUBDOMAIN'],
  twitch: ['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET', 'TWITCH_REFRESH_TOKEN'],
  youtube: ['YOUTUBE_API_KEY'],
  webhooks: ['YOUTUBE_VERIFY_TOKEN', 'YOUTUBE_CALLBACK_SECRET'],
} as const;
export type ServiceId = keyof typeof SERVICE_FIELDS;
export type ServiceState =
  | 'missing'
  | 'configured'
  | 'active'
  | 'invalid'
  | 'unavailable'
  | 'disabled';
const STORE_KEY = 'service_credentials:v1';
const AAD = Buffer.from('EVA service credentials v1');

export class ServiceCredentialsService {
  private values: Partial<Record<CredentialKey, string | null>> = {};
  private checking: Promise<void> | null = null;
  private lastChecked = 0;
  locked = false;
  constructor(private keyFile?: string) {}
  private masterKey(create = false): Buffer {
    const filename =
      this.keyFile ?? join(dirname(resolve(env.DATABASE_PATH)), 'service-credentials.key');
    let key: Buffer;
    try {
      key = readFileSync(filename);
    } catch (error) {
      if (!create || (error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error('The credential encryption key is unavailable.');
      mkdirSync(dirname(filename), { recursive: true });
      key = randomBytes(32);
      writeFileSync(filename, key, { flag: 'wx', mode: 0o600 });
    }
    if (key.length !== 32) throw new Error('The credential encryption key is invalid.');
    return key;
  }
  load(): void {
    const row = db.prepare('SELECT value FROM app_settings WHERE key=?').get(STORE_KEY) as
      | { value: string }
      | undefined;
    if (!row) return;
    try {
      const payload = JSON.parse(row.value) as { iv: string; tag: string; data: string };
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.masterKey(),
        Buffer.from(payload.iv, 'base64'),
      );
      decipher.setAAD(AAD);
      decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
      const values = JSON.parse(
        Buffer.concat([
          decipher.update(Buffer.from(payload.data, 'base64')),
          decipher.final(),
        ]).toString('utf8'),
      ) as Record<string, unknown>;
      if (
        !values ||
        Array.isArray(values) ||
        Object.keys(values).some(
          (k) =>
            !CREDENTIAL_KEYS.includes(k as CredentialKey) ||
            (values[k] !== null &&
              (typeof values[k] !== 'string' || String(values[k]).length > 1024)),
        )
      )
        throw new Error('Invalid stored credentials.');
      this.values = values;
      replaceCredentialOverrides(this.values);
      this.locked = false;
    } catch {
      this.locked = true;
    }
  }
  save(
    service: ServiceId,
    fields: Partial<Record<CredentialKey, string | null>>,
    mode: 'save' | 'disable' | 'environment' = 'save',
  ): void {
    if (this.locked)
      throw new Error(
        'Stored credentials are locked. Restore service-credentials.key before changing them.',
      );
    const next = { ...this.values };
    for (const key of SERVICE_FIELDS[service]) {
      if (mode === 'environment') delete next[key];
      else if (mode === 'disable') next[key] = null;
      else if (fields[key]?.trim()) {
        const value = fields[key]!.trim();
        if (
          key === 'CHALLONGE_SUBDOMAIN'
            ? !/^[a-z0-9-]{1,64}$/i.test(value)
            : value.length < 8 ||
              value.length > 1024 ||
              /[\r\n]/.test(value) ||
              value.includes(String.fromCharCode(0))
        )
          throw new Error(
            'Check the credential format. Secrets need 8-1024 characters without line breaks.',
          );
        next[key] = value;
      }
    }
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', this.masterKey(true), iv);
    cipher.setAAD(AAD);
    const data = Buffer.concat([cipher.update(JSON.stringify(next), 'utf8'), cipher.final()]);
    db.prepare(
      `INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`,
    ).run(
      STORE_KEY,
      JSON.stringify({
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        data: data.toString('base64'),
      }),
    );
    this.values = next;
    replaceCredentialOverrides(next);
    db.prepare('DELETE FROM app_settings WHERE key=?').run(`service_status:${service}`);
  }
  status(service: ServiceId): ServiceState {
    if (SERVICE_FIELDS[service].every((k) => this.values[k] === null)) return 'disabled';
    const required = SERVICE_FIELDS[service].slice(
      0,
      service === 'twitch' || service === 'webhooks' ? 2 : 1,
    );
    if (!required.every((k) => configuredCredential(k))) return 'missing';
    const row = db
      .prepare('SELECT value FROM app_settings WHERE key=?')
      .get(`service_status:${service}`) as { value: string } | undefined;
    try {
      const saved = row ? JSON.parse(row.value) : null;
      if (saved && Date.now() - saved.at < 24 * 3600000) return saved.state;
    } catch {
      /* Status is optional. */
    }
    return 'configured';
  }
  checkAll(): Promise<void> {
    if (this.checking) return this.checking;
    if (Date.now() - this.lastChecked < 60000) return Promise.resolve();
    this.lastChecked = Date.now();
    this.checking = Promise.all(
      (Object.keys(SERVICE_FIELDS) as ServiceId[]).map((s) => this.check(s)),
    )
      .then(() => undefined)
      .finally(() => {
        this.checking = null;
      });
    return this.checking;
  }
  async check(service: ServiceId): Promise<ServiceState> {
    let state = this.status(service);
    if (state === 'missing' || state === 'disabled') return state;
    const config = {
      timeout: 8000,
      maxRedirects: 0,
      maxContentLength: 512 * 1024,
      maxBodyLength: 512 * 1024,
    };
    try {
      if (service === 'twitch') {
        const res = await axios.post('https://id.twitch.tv/oauth2/token', null, {
          ...config,
          params: {
            client_id: env.TWITCH_CLIENT_ID,
            client_secret: env.TWITCH_CLIENT_SECRET,
            grant_type: 'client_credentials',
          },
        });
        if (!res.data.access_token) throw new Error('Invalid response.');
      } else if (service === 'challonge')
        await axios.get('https://api.challonge.com/v1/tournaments.json', {
          ...config,
          params: { api_key: env.CHALLONGE_API_KEY, state: 'pending' },
        });
      else if (service === 'youtube')
        await axios.get('https://www.googleapis.com/youtube/v3/i18nLanguages', {
          ...config,
          params: { key: env.YOUTUBE_API_KEY, part: 'snippet' },
        });
      state = service === 'webhooks' ? 'configured' : 'active';
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status;
      state = status && [400, 401, 403].includes(status) ? 'invalid' : 'unavailable';
    }
    db.prepare(
      `INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    ).run(`service_status:${service}`, JSON.stringify({ state, at: Date.now() }));
    return state;
  }
}
export const serviceCredentials = new ServiceCredentialsService();
