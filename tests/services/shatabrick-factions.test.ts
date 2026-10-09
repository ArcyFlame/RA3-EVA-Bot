import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { connectDatabase } from '../../src/database/connection';
import { db } from '../../src/database/sqlite';
import {
  parseShatabrickFactionHtml,
  ShatabrickFactionService,
} from '../../src/services/shatabrick-factions.service';
import { safeGetText } from '../../src/utils/safe-fetch';
vi.mock('../../src/utils/safe-fetch', () => ({ safeGetText: vi.fn() }));
beforeAll(connectDatabase);
beforeEach(() => {
  vi.clearAllMocks();
  db.prepare("DELETE FROM app_settings WHERE key='shatabrick_factions:ra3:monthly'").run();
});
afterEach(() => vi.useRealTimers());
function sample() {
  return {
    monthly: {
      generated_at: new Date().toUTCString(),
      all: {
        total_matches: 60,
        factions: [
          { label: 'Allies', plays: 30 },
          { label: 'Soviet', plays: 20 },
          { label: 'Empire', plays: 10 },
        ],
      },
    },
    daily: { all: { factions: [{ label: 'Allies', plays: 99 }] } },
  };
}
function html(data: unknown = sample()) {
  return `<div id="fstats-ra3"></div><script>var module=document.getElementById("fstats-ra3");var dataset=${JSON.stringify(data)};throw new Error("must never execute this");</script>`;
}
describe('Shatabrick monthly faction data', () => {
  it('reads actual monthly picks, not wins, the daily window or ranked-only counts', () => {
    expect(parseShatabrickFactionHtml(html())?.counts).toEqual({
      Allies: 30,
      Soviets: 20,
      Empire: 10,
    });
  });
  it('never executes scripts or accepts non-JSON JavaScript', () => {
    const malicious =
      '<div id="fstats-ra3"></div><script>var dataset={monthly:(()=>{throw new Error("executed")})()};/* fstats-ra3 */</script>';
    expect(parseShatabrickFactionHtml(malicious)).toBeUndefined();
    expect(
      parseShatabrickFactionHtml(html().replace('fstats-ra3', 'fstats-genevo')),
    ).toBeUndefined();
  });
  it.each(['negative', 'string', 'unknown', 'duplicate', 'total', 'expired', 'future'])(
    'rejects invalid %s data rather than inventing zeroes',
    (kind) => {
      const data = sample();
      if (kind === 'negative') data.monthly.all.factions[0].plays = -1;
      if (kind === 'string')
        (data.monthly.all.factions[0] as unknown as { plays: unknown }).plays = '30';
      if (kind === 'unknown') data.monthly.all.factions[0].label = 'Unknown';
      if (kind === 'duplicate') data.monthly.all.factions[0].label = 'Soviet';
      if (kind === 'total') data.monthly.all.total_matches = 999;
      if (kind === 'expired') data.monthly.generated_at = 'Mon, 01 Jan 2024 00:00:00 GMT';
      if (kind === 'future')
        data.monthly.generated_at = new Date(Date.now() + 3600000).toUTCString();
      expect(parseShatabrickFactionHtml(html(data))).toBeUndefined();
    },
  );
  it('deduplicates concurrent requests, persists verified data and retains it across outages/restarts', async () => {
    vi.mocked(safeGetText).mockResolvedValue(html());
    const service = new ShatabrickFactionService();
    const [a, b] = await Promise.all([service.fetch(), service.fetch()]);
    expect(a).toEqual(b);
    expect(safeGetText).toHaveBeenCalledTimes(1);
    vi.mocked(safeGetText).mockResolvedValue(undefined);
    expect((await new ShatabrickFactionService().fetch())?.counts).toEqual(a?.counts);
  });
  it('expires stale cached data rather than displaying it indefinitely', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T10:00:00Z'));
    vi.mocked(safeGetText).mockResolvedValue(html());
    await new ShatabrickFactionService().fetch();
    vi.setSystemTime(Date.now() + 25 * 3600000);
    vi.mocked(safeGetText).mockResolvedValue(undefined);
    expect(await new ShatabrickFactionService().fetch()).toBeUndefined();
  });
});
