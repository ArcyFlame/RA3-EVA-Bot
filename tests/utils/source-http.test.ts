import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { safeGetText, sourceGet } from '../../src/utils/safe-fetch';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));
beforeEach(() => {
  vi.mocked(axios.get).mockReset();
});

describe('bounded scanner HTTP reads', () => {
  it('retries one transient read with timeout/body/redirect limits', async () => {
    vi.mocked(axios.get)
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValueOnce({ status: 200, data: 'ok', headers: {} });
    expect((await sourceGet('https://api.ra3battle.cn/api/status', { timeout: 99_000 })).data).toBe(
      'ok',
    );
    expect(axios.get).toHaveBeenCalledTimes(2);
    expect(vi.mocked(axios.get).mock.calls[0][1]).toMatchObject({
      timeout: 15_000,
      maxContentLength: 4 * 1024 * 1024,
      maxRedirects: 0,
    });
  });
  it('does not retry a permanent failure', async () => {
    vi.mocked(axios.get).mockRejectedValue({ response: { status: 404 } });
    await expect(sourceGet('https://cnc-online.net/not-found')).rejects.toMatchObject({
      response: { status: 404 },
    });
    expect(axios.get).toHaveBeenCalledTimes(1);
  });
  it('cools a rate-limited provider down instead of consuming more requests', async () => {
    vi.mocked(axios.get).mockRejectedValue({
      response: { status: 429, headers: { 'retry-after': '3600' } },
    });
    await expect(sourceGet('https://api.challonge.com/v1/limited')).rejects.toMatchObject({
      response: { status: 429 },
    });
    await expect(sourceGet('https://api.challonge.com/v1/other')).rejects.toThrow('cooling down');
    expect(axios.get).toHaveBeenCalledTimes(1);
  });
  it('checks each text redirect and refuses credentials, private hosts, non-HTTPS and nonstandard ports', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      status: 302,
      headers: { location: 'https://127.0.0.1/private' },
    });
    expect(await safeGetText('https://www.gamereplays.org/redalert3/')).toBeUndefined();
    expect(axios.get).toHaveBeenCalledTimes(1);
    for (const url of [
      'http://www.moddb.com/news',
      'https://user:pass@www.moddb.com/news',
      'https://www.moddb.com:444/news',
      'https://10.0.0.1/',
      'https://moddb.com.evil.example/',
    ])
      await expect(sourceGet(url)).rejects.toThrow();
    expect(axios.get).toHaveBeenCalledTimes(1);
  });
});
