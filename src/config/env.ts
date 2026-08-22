import dotenv from 'dotenv';

dotenv.config();

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** Returns a trimmed non-empty env value, or undefined. */
function optional(key: string): string | undefined {
  const value = process.env[key];
  if (value === undefined || value.trim() === '') return undefined;
  return value.trim();
}

function required(key: string): string {
  const value = optional(key);
  if (!value) throw new ConfigError(`Missing required environment variable: ${key}`);
  return value;
}

/** Discord snowflakes are 17–20 digit decimal strings. Kept as strings to avoid precision loss. */
function snowflake(key: string): string | null {
  const value = optional(key);
  if (!value) return null;
  if (!/^\d{17,20}$/.test(value)) {
    throw new ConfigError(`${key} must be a Discord snowflake (17–20 digits), got: "${value}"`);
  }
  return value;
}

function httpUrl(key: string): string | undefined {
  const value = optional(key);
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new ConfigError(`${key} must use http(s), got: "${value}"`);
    }
    return value;
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    throw new ConfigError(`${key} is not a valid URL: "${value}"`);
  }
}

function port(key: string, defaultValue: number): number {
  const value = optional(key);
  if (!value) return defaultValue;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new ConfigError(`${key} must be an integer between 1 and 65535, got: "${value}"`);
  }
  return parsed;
}

const LOG_LEVELS = ['error', 'warn', 'audit', 'info', 'debug'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

function logLevel(): LogLevel {
  const value = optional('LOG_LEVEL');
  if (!value) return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
  if ((LOG_LEVELS as readonly string[]).includes(value)) return value as LogLevel;
  throw new ConfigError(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}, got: "${value}"`);
}

export const env = {
  // ── Core ──────────────────────────────────────────────────────────────
  DISCORD_TOKEN: required('DISCORD_TOKEN'),
  DATABASE_PATH: optional('DATABASE_PATH') ?? './data/bot.db',
  /** Dev/testing guild for instant command registration. Omit for global registration. */
  GUILD_ID: snowflake('GUILD_ID'),
  /** Fallback admin role (per-guild role configured via /setup takes precedence). */
  ADMIN_ROLE_ID: snowflake('ADMIN_ROLE_ID'),
  /** Bot owner — gates destructive commands (/kill, /restart). Strongly recommended. */
  OWNER_ID: snowflake('OWNER_ID'),

  // ── Challonge (optional — tournament commands degrade gracefully) ─────
  CHALLONGE_API_KEY: optional('CHALLONGE_API_KEY'),
  CHALLONGE_SUBDOMAIN: optional('CHALLONGE_SUBDOMAIN'),

  // ── Twitch (optional — notifier disabled when absent) ─────────────────
  TWITCH_CLIENT_ID: optional('TWITCH_CLIENT_ID'),
  TWITCH_CLIENT_SECRET: optional('TWITCH_CLIENT_SECRET'),
  TWITCH_REFRESH_TOKEN: optional('TWITCH_REFRESH_TOKEN'),

  // ── YouTube (optional) ────────────────────────────────────────────────
  YOUTUBE_API_KEY: optional('YOUTUBE_API_KEY'),
  YOUTUBE_CALLBACK_BASE: httpUrl('YOUTUBE_CALLBACK_BASE'),
  YOUTUBE_VERIFY_TOKEN: optional('YOUTUBE_VERIFY_TOKEN'),
  /** Shared secret for X-Hub-Signature HMAC verification of PubSubHubbub pushes. */
  YOUTUBE_CALLBACK_SECRET: optional('YOUTUBE_CALLBACK_SECRET'),

  // ── Misc ──────────────────────────────────────────────────────────────
  STEAM_API_KEY: optional('STEAM_API_KEY'),
  PUBLIC_CALLBACK_URL: httpUrl('PUBLIC_CALLBACK_URL'),
  WEBHOOK_PORT: port('WEBHOOK_PORT', 8081),

  // ── Logging ───────────────────────────────────────────────────────────
  LOG_LEVEL: logLevel(),
  /** Optional path for a file log transport (e.g. ./logs/bot.log). */
  LOG_FILE: optional('LOG_FILE'),
} as const;

if (!env.CHALLONGE_API_KEY) {
  // eslint-disable-next-line no-console
  console.warn('[config] CHALLONGE_API_KEY missing - Challonge tournament integration disabled');
}
