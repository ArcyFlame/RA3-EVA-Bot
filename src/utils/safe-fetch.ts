import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { logger } from './logger';

/**
 * The only sanctioned way out to the internet for scraper/notifier code.
 * HTTPS-only, host allowlist, private/loopback addresses refused before any
 * socket is opened. Adding a host means editing this file on purpose.
 */
const HOST_ALLOWLIST = new Set([
  'www.gamereplays.org',
  'gamereplays.org',
  'api.challonge.com',
  'challonge.com',
  'www.challonge.com',
  'api.ra3battle.cn',
  'cnc-online.net',
  'www.cnc-online.net',
  'rss.moddb.com',
  'www.moddb.com',
  'www.youtube.com',
  'www.googleapis.com',
  'api.twitch.tv',
  'shatabrick.com',
  'www.shatabrick.com',
  'steamplayercount.com',
]);

export class FetchRefusedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'FetchRefusedError';
  }
}

function assertAllowed(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new FetchRefusedError(`invalid URL: ${rawUrl.slice(0, 120)}`);
  }
  if (parsed.protocol !== 'https:') {
    throw new FetchRefusedError(`refused non-HTTPS protocol ${parsed.protocol}`);
  }
  const host = parsed.hostname.toLowerCase();
  if (parsed.username || parsed.password || (parsed.port && parsed.port !== '443')) {
    throw new FetchRefusedError('credentials and nonstandard ports are not allowed');
  }
  if (!HOST_ALLOWLIST.has(host)) {
    throw new FetchRefusedError(`host not in allowlist: ${host}`);
  }
  // Literal loopback/private ranges (defence in depth — the allowlist above
  // already blocks everything unexpected).
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.local') ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    throw new FetchRefusedError(`refused private host: ${host}`);
  }
  return parsed;
}

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const blockedUntil = new Map<string, number>();
const MAX_SOURCE_BYTES = 4 * 1024 * 1024;

/** Bounded retries for read-only sources; never retry writes or bypass rate limits. */
export async function sourceGet<T = AxiosResponse['data']>(
  url: string,
  config: AxiosRequestConfig = {},
): Promise<AxiosResponse<T>> {
  const parsed = assertAllowed(url);
  const origin = parsed.origin;
  if ((blockedUntil.get(origin) ?? 0) > Date.now())
    throw new Error(`Source cooling down: ${parsed.host}`);
  for (let attempt = 0; ; attempt++) {
    try {
      return await axios.get<T>(url, {
        ...config,
        timeout: Math.min(Math.max(config.timeout || 15_000, 1), 15_000),
        maxContentLength: MAX_SOURCE_BYTES,
        maxBodyLength: MAX_SOURCE_BYTES,
        maxRedirects: 0,
      });
    } catch (error) {
      const failure = error as {
        code?: string;
        response?: { status?: number; headers?: Record<string, unknown> };
      };
      const status = failure.response?.status;
      if (status === 429) {
        const value = String(failure.response?.headers?.['retry-after'] ?? '');
        const delay = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - Date.now();
        blockedUntil.set(
          origin,
          Date.now() +
            Math.min(
              24 * 60 * 60_000,
              Math.max(60_000, Number.isFinite(delay) && delay > 0 ? delay : 30 * 60_000),
            ),
        );
        throw error;
      }
      const transient =
        (status !== undefined && [408, 500, 502, 503, 504].includes(status)) ||
        ['ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT', 'EAI_AGAIN'].includes(failure.code ?? '');
      if (!transient || attempt === 1) throw error;
      const value = String(failure.response?.headers?.['retry-after'] ?? '');
      const wait = /^\d+$/.test(value) ? Number(value) * 1000 : 500;
      if (wait > 2000) {
        blockedUntil.set(origin, Date.now() + Math.min(wait, 24 * 60 * 60_000));
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, Math.max(100, wait)));
    }
  }
}

/** Decodes response bytes using the declared HTTP or HTML charset. */
export function decodeResponseText(
  data: ArrayBuffer | Uint8Array | string,
  contentType = '',
): string {
  if (typeof data === 'string') return data;
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const headerCharset = contentType.match(/charset\s*=\s*["']?([^;\s"']+)/i)?.[1];
  const opening = Buffer.from(bytes.subarray(0, 2048)).toString('latin1');
  const htmlCharset = opening.match(/charset\s*=\s*["']?([^;\s"'>]+)/i)?.[1];
  const declared = (headerCharset || htmlCharset || 'utf-8').toLowerCase();
  const encoding = /^(?:iso-8859-1|latin-?1|windows-1252|cp1252)$/.test(declared)
    ? 'windows-1252'
    : 'utf-8';
  return new TextDecoder(encoding).decode(bytes);
}

/** GET text/HTML from an allowlisted host. Returns undefined on failure. */
export async function safeGetText(
  url: string,
  opts: { timeoutMs?: number } = {},
): Promise<string | undefined> {
  try {
    assertAllowed(url);
  } catch (err) {
    logger.warn(`safeFetch: ${(err as Error).message}`);
    return undefined;
  }
  try {
    let current = assertAllowed(url);
    for (let redirects = 0; redirects <= 4; redirects++) {
      const res = await sourceGet<ArrayBuffer>(current.toString(), {
        headers: { 'User-Agent': BROWSER_UA },
        timeout: opts.timeoutMs ?? 15_000,
        responseType: 'arraybuffer',
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400,
      });
      if (res.status >= 300) {
        const location = res.headers.location;
        if (!location || redirects === 4) return undefined;
        current = assertAllowed(new URL(location, current).toString());
        continue;
      }
      return decodeResponseText(res.data, String(res.headers['content-type'] ?? ''));
    }
    return undefined;
  } catch (err) {
    logger.warn(`safeFetch: GET failed for ${new URL(url).host}: ${(err as Error).message}`);
    return undefined;
  }
}
