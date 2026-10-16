import { sourceGet } from './safe-fetch';
import type { TwitchStream } from '../services/twitch.service';

/** Pin the current frame to Discord rather than linking a mutable/offline Twitch preview. */
export async function fetchTwitchPreview(stream: TwitchStream): Promise<Buffer | undefined> {
  if (!stream.thumbnailUrl) return undefined;
  try {
    const url = new URL(
      stream.thumbnailUrl.replaceAll('{width}', '1280').replaceAll('{height}', '720'),
    );
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'static-cdn.jtvnw.net' ||
      url.username ||
      url.password ||
      (url.port && url.port !== '443') ||
      !/^\/previews-ttv\/live_user_[a-z0-9_]+-1280x720\.jpg$/i.test(url.pathname)
    )
      return undefined;
    // A new stream session must not reuse Discord's cached image from an earlier broadcast.
    url.searchParams.set('eva', stream.id);
    const response = await sourceGet<ArrayBuffer>(url.toString(), {
      responseType: 'arraybuffer',
      timeout: 5000,
    });
    const bytes = Buffer.from(response.data);
    if (
      response.status !== 200 ||
      !/^image\/jpeg(?:;|$)/i.test(String(response.headers['content-type'] ?? '')) ||
      bytes.length < 4 ||
      bytes.length > 4 * 1024 * 1024 ||
      bytes[0] !== 0xff ||
      bytes[1] !== 0xd8 ||
      bytes[2] !== 0xff
    )
      return undefined;
    return bytes;
  } catch {
    // Missing, redirected (offline), rate-limited or failed previews use per-game artwork.
    // Do not fail the notification or leak request credentials in logs.
    return undefined;
  }
}
