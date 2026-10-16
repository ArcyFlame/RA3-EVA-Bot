import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sourceGet } from '../../src/utils/safe-fetch';
import { fetchTwitchPreview } from '../../src/utils/twitch-preview';
import type { TwitchStream } from '../../src/services/twitch.service';

vi.mock('../../src/utils/safe-fetch', () => ({ sourceGet: vi.fn() }));
const stream = (thumbnailUrl: string) => ({ id: 'session-123', thumbnailUrl }) as TwitchStream;
const url = 'https://static-cdn.jtvnw.net/previews-ttv/live_user_player-{width}x{height}.jpg';
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]);
beforeEach(() => {
  vi.mocked(sourceGet).mockReset();
});

describe('bounded Twitch preview snapshots', () => {
  it('downloads a session-specific preview for attachment storage', async () => {
    vi.mocked(sourceGet).mockResolvedValue({
      status: 200,
      data: jpeg,
      headers: { 'content-type': 'image/jpeg' },
    } as never);
    expect(await fetchTwitchPreview(stream(url))).toEqual(jpeg);
    expect(sourceGet).toHaveBeenCalledWith(
      'https://static-cdn.jtvnw.net/previews-ttv/live_user_player-1280x720.jpg?eva=session-123',
      { responseType: 'arraybuffer', timeout: 5000 },
    );
  });
  it.each([
    '',
    'http://static-cdn.jtvnw.net/previews-ttv/live_user_player-1280x720.jpg',
    'https://127.0.0.1/image.jpg',
    'https://static-cdn.jtvnw.net.evil.test/image.jpg',
    'https://secret@static-cdn.jtvnw.net/previews-ttv/live_user_player-1280x720.jpg',
    'https://static-cdn.jtvnw.net:8443/previews-ttv/live_user_player-1280x720.jpg',
    'https://static-cdn.jtvnw.net/ttv-static/404_preview-1280x720.jpg',
  ])('does not fetch missing or untrusted previews: %s', async (value) => {
    expect(await fetchTwitchPreview(stream(value))).toBeUndefined();
    expect(sourceGet).not.toHaveBeenCalled();
  });
  it.each([
    { status: 302, data: jpeg, headers: { 'content-type': 'image/jpeg' } },
    {
      status: 200,
      data: Buffer.from('<html>Unavailable</html>'),
      headers: { 'content-type': 'text/html' },
    },
    { status: 200, data: Buffer.from('not a jpeg'), headers: { 'content-type': 'image/jpeg' } },
    {
      status: 200,
      data: Buffer.alloc(4 * 1024 * 1024 + 1),
      headers: { 'content-type': 'image/jpeg' },
    },
  ])('falls back for unusable image responses', async (response) => {
    vi.mocked(sourceGet).mockResolvedValue(response as never);
    expect(await fetchTwitchPreview(stream(url))).toBeUndefined();
  });
  it('falls back on offline previews, rate limits and network errors', async () => {
    vi.mocked(sourceGet).mockRejectedValue(new Error('unavailable'));
    expect(await fetchTwitchPreview(stream(url))).toBeUndefined();
  });
});
