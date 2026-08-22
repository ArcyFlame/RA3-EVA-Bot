import winston from 'winston';
import { env } from '../config/env';

const LEVELS = { error: 0, warn: 1, audit: 2, info: 3, debug: 4 } as const;

/**
 * Values that must never appear in logs. Collected from the validated env so
 * the redactor automatically covers every configured credential.
 */
function collectSecrets(): string[] {
  const candidates: Array<string | undefined | null> = [
    env.DISCORD_TOKEN,
    env.TWITCH_CLIENT_SECRET,
    env.TWITCH_REFRESH_TOKEN,
    env.CHALLONGE_API_KEY,
    env.YOUTUBE_API_KEY,
    env.YOUTUBE_VERIFY_TOKEN,
    env.YOUTUBE_CALLBACK_SECRET,
    env.STEAM_API_KEY,
  ];
  // Ignore absent/short values - redacting "" or "abc" would corrupt every line.
  return candidates.filter((s): s is string => typeof s === 'string' && s.length >= 8);
}

const secrets = collectSecrets();

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6) return value;
  if (typeof value === 'string') {
    let out = value;
    for (const secret of secrets) {
      if (out.includes(secret)) out = out.split(secret).join('[REDACTED]');
    }
    return out;
  }
  if (value instanceof Error) {
    value.message = scrub(value.message) as string;
    if (value.stack) value.stack = scrub(value.stack) as string;
    // Axios/network errors carry the request config (headers, params with
    // secrets) plus live handles (request/socket/connection/response). The
    // socket's native getters can throw ("Cannot read properties of null
    // (reading 'reading')") when winston's serializer walks them after a
    // timeout — that crash killed the whole process, so every carrier is
    // replaced with a safe marker.
    const anyErr = value as unknown as Record<string, unknown>;
    if (anyErr.config) anyErr.config = '[REDACTED_CONFIG]';
    if (anyErr.request) anyErr.request = '[REDACTED_REQUEST]';
    if (anyErr.socket) anyErr.socket = '[REDACTED_SOCKET]';
    if (anyErr.connection) anyErr.connection = '[REDACTED_CONNECTION]';
    if (anyErr.res) anyErr.res = '[REDACTED_RESPONSE]';
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = /token|secret|password|authorization|api[-_]?key/i.test(k)
        ? '[REDACTED]'
        : scrub(v, depth + 1);
    }
    return out;
  }
  return value;
}

const redact = winston.format((info) => {
  info.message = scrub(info.message) as string | symbol;
  const meta = scrub({ ...info });
  Object.assign(info, meta);
  return info;
});

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize({
        colors: {
          error: 'red',
          warn: 'yellow',
          audit: 'yellow',
          info: 'green',
          debug: 'blue',
        },
      }),
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const rest = Object.keys(meta).length ? ` ${safeStringify(meta)}` : '';
        return `${timestamp} [${level.toUpperCase()}]: ${String(message)}${rest}`;
      }),
    ),
  }),
];

if (env.LOG_FILE) {
  transports.push(
    new winston.transports.File({
      filename: env.LOG_FILE,
      maxsize: 10 * 1024 * 1024, // 10 MB rotation cap
      maxFiles: 5,
      tailable: true,
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    }),
  );
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable metadata]';
  }
}

export const logger = winston.createLogger({
  levels: LEVELS,
  level: env.LOG_LEVEL,
  format: redact(),
  transports,
});

/**
 * Process-level safety net: a stray throw inside a timer/promise must never
 * take the whole bot down. Winston handles the formatting (and the redaction
 * above keeps credentials out of these dumps).
 */
process.on('uncaughtException', (error) => {
  logger.error('UNCAUGHT EXCEPTION (bot keeps running):', error);
});
process.on('unhandledRejection', (reason) => {
  logger.error('UNHANDLED REJECTION (bot keeps running):', reason);
});

/**
 * Audit trail for privileged actions (admin commands, config changes,
 * permission overrides). Always emitted at its own level so it can be
 * routed/alerted independently of chatter.
 */
export function audit(action: string, context: Record<string, unknown>): void {
  logger.log('audit', action, context);
}
