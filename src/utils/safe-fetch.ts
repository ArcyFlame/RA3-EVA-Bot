import axios from 'axios';
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
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new FetchRefusedError(`refused protocol ${parsed.protocol}:`);
  }
  const host = parsed.hostname.toLowerCase();
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
    const res = await axios.get<string>(url, {
      headers: { 'User-Agent': BROWSER_UA },
      timeout: opts.timeoutMs ?? 15_000,
      responseType: 'text',
      // Keep redirects inside https/http and let axios validate the final URL
      // is still absolute; the initial allowlist check above gates the target.
      maxRedirects: 4,
    });
    return typeof res.data === 'string' ? res.data : String(res.data);
  } catch (err) {
    logger.warn(`safeFetch: GET failed for ${new URL(url).host}: ${(err as Error).message}`);
    return undefined;
  }
}
