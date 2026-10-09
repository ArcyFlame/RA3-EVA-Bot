import { beforeAll, describe, expect, it } from 'vitest';
import { connectDatabase } from '../../src/database/connection';
import {
  ActivityRankRepository,
  MAX_ACTIVITY_RANKS,
} from '../../src/repositories/activity-rank.repository';

const repo = new ActivityRankRepository();
beforeAll(async () => {
  await connectDatabase();
});
const award = (
  guildId: string,
  userId = 'member',
  date = '2026-10-09',
  hashes: string[] = [],
  ping = true,
) =>
  repo.recordActivity({
    guildId,
    userId,
    activityDate: date,
    replayFingerprints: hashes,
    hasCncPing: ping,
  });
const hash = (n: number) => n.toString(16).padStart(64, '0');

describe('activity awards', () => {
  it('counts one ping per UTC day, including after a repository restart', () => {
    expect(award('ping').pointsAwarded).toBe(25);
    for (let n = 0; n < 15; n++) expect(award('ping').pointsAwarded).toBe(0);
    const restarted = new ActivityRankRepository();
    expect(
      restarted.recordActivity({
        guildId: 'ping',
        userId: 'member',
        activityDate: '2026-10-09',
        hasCncPing: true,
        replayFingerprints: [],
      }).pointsAwarded,
    ).toBe(0);
    expect(award('ping', 'member', '2026-10-10').pointsAwarded).toBe(25);
    expect(repo.getMember('ping', 'member')?.qualifyingCncPings).toBe(2);
  });
  it('awards nothing for ordinary chat', () => {
    expect(award('chat', 'member', '2026-10-09', [], false).pointsAwarded).toBe(0);
    expect(repo.getLeaderboard('chat')).toEqual([]);
  });
  it('deduplicates files across members and days, but isolates servers', () => {
    expect(award('replays', 'first', '2026-10-09', [hash(1), hash(1)], false).replaysAwarded).toBe(
      1,
    );
    expect(award('replays', 'second', '2026-10-10', [hash(1)], false).replaysAwarded).toBe(0);
    expect(award('other', 'second', '2026-10-10', [hash(1)], false).replaysAwarded).toBe(1);
  });
  it('caps daily replays and respects disabled sources and custom XP', () => {
    repo.updateSettings('caps', { pingEnabled: false, replayPoints: 40, replayDailyCap: 2 }, 0);
    expect(award('caps', 'member', '2026-10-09', [hash(2), hash(3), hash(4)])).toMatchObject({
      pointsAwarded: 80,
      replaysAwarded: 2,
      cncPingAwarded: false,
    });
    expect(award('caps', 'member', '2026-10-09', [hash(5)]).pointsAwarded).toBe(0);
    repo.updateSettings('caps', { replayEnabled: false }, 1);
    expect(award('caps', 'member', '2026-10-10', [hash(5)]).pointsAwarded).toBe(0);
  });
  it('persists download budgets and keeps daily claims when XP is reset', () => {
    for (let n = 0; n < 6; n++)
      expect(repo.claimReplayDownload('traffic', 'member', '2026-10-09')).toBe(true);
    expect(
      new ActivityRankRepository().claimReplayDownload('traffic', 'member', '2026-10-09'),
    ).toBe(false);
    expect(repo.claimReplayDownload('traffic', 'member', '2026-10-10')).toBe(true);
    award('reset', 'member', '2026-10-09', [hash(6)]);
    repo.resetMember('reset', 'member');
    expect(repo.getMember('reset', 'member')?.points).toBe(0);
    expect(repo.getTrackedUserIds('reset')).toContain('member');
    expect(award('reset', 'member', '2026-10-09', [hash(6)]).pointsAwarded).toBe(0);
  });
  it('keeps rating verification separate from upload XP limits with a persistent traffic cap', () => {
    const id = 'rating-traffic';
    award(id, 'member', '2026-10-09', [hash(10), hash(11), hash(12)], false);
    expect(repo.claimReplayDownload(id, 'member', '2026-10-09')).toBe(false);
    for (let n = 0; n < 20; n++)
      expect(repo.claimReplayDownload(id, 'member', '2026-10-09', true)).toBe(true);
    expect(new ActivityRankRepository().claimReplayDownload(id, 'member', '2026-10-09', true)).toBe(
      false,
    );
    expect(repo.getMember(id, 'member')?.points).toBe(75);
    expect(repo.claimReplayDownload(id, 'member', '2026-10-10', true)).toBe(true);
    repo.updateSettings(id, { ratingsEnabled: false }, 0);
    expect(repo.claimReplayDownload(id, 'member', '2026-10-09', true)).toBe(false);
  });
});

describe('configurable ranks', () => {
  it('defaults to 50 ping days per rank and allows a custom top-rank duration', () => {
    const initial = repo.getRankDefinitions('days');
    expect(initial).toHaveLength(9);
    expect(initial[0].threshold).toBe(1250);
    expect(initial[8].threshold).toBe(11250);
    repo.updateSettings('days', { progressionMode: 'max_days', maxRankDays: 90 }, 0);
    expect(repo.getRankDefinitions('days').map((r) => r.threshold)).toEqual([
      250, 500, 750, 1000, 1250, 1500, 1750, 2000, 2250,
    ]);
    repo.updateSettings('days', { pingPoints: 10 }, 1);
    expect(repo.getRankDefinitions('days')[8].threshold).toBe(900);
  });
  it('rejects stale settings, invalid numbers and colliding schedules atomically', () => {
    repo.updateSettings('validation', { daysPerRank: 10 }, 0);
    expect(() => repo.updateSettings('validation', { daysPerRank: 11 }, 0)).toThrow('another menu');
    expect(() => repo.updateSettings('validation', { pingPoints: 0 }, 1)).toThrow('Ping XP');
    expect(() =>
      repo.updateSettings(
        'validation',
        { progressionMode: 'max_days', maxRankDays: 1, pingPoints: 1 },
        1,
      ),
    ).toThrow('distinct threshold');
    expect(repo.getSettings('validation')).toMatchObject({
      progressionMode: 'per_rank',
      pingPoints: 25,
      version: 1,
    });
  });
  it('adds, renames, reorders and removes ranks while preserving stable IDs', () => {
    const rank = repo.addRank('dynamic', 'Commander', 0);
    expect(rank).toMatchObject({ rank: 10, title: 'Commander', threshold: 12500 });
    repo.editRank('dynamic', rank.id, 'Supreme Commander', 13000, 1);
    repo.moveRank('dynamic', rank.id, -1, 2);
    expect(repo.getRank('dynamic', rank.id)).toMatchObject({
      rank: 9,
      title: 'Supreme Commander',
      threshold: 11250,
    });
    repo.removeRank('dynamic', rank.id, 3);
    expect(repo.getRankDefinitions('dynamic')).toHaveLength(9);
  });
  it('does not recreate defaults when all ranks are removed', () => {
    for (const rank of repo.getRankDefinitions('empty'))
      repo.removeRank('empty', rank.id, repo.getSettings('empty').version);
    expect(repo.getRankDefinitions('empty')).toEqual([]);
    expect(repo.addRank('empty', 'First', repo.getSettings('empty').version).rank).toBe(1);
  });
  it('rejects duplicate roles and retains obsolete mappings for cleanup', () => {
    const [first, second] = repo.getRankDefinitions('roles');
    repo.setRankRole('roles', first.id, '111111111111111111', 0);
    expect(() => repo.setRankRole('roles', second.id, '111111111111111111', 1)).toThrow(
      'another rank',
    );
    repo.setRankRole('roles', first.id, null, 1);
    expect(repo.getRetiredRoleIds('roles')).toContain('111111111111111111');
  });
  it('bounds rank count, thresholds, names and XP adjustments', () => {
    for (let n = 9; n < MAX_ACTIVITY_RANKS; n++) repo.addRank('many', 'Rank ' + n, n - 9);
    expect(() => repo.addRank('many', 'Extra', repo.getSettings('many').version)).toThrow('100');
    expect(() => repo.addRank('invalid-title', '\n\x00', 0)).toThrow('Rank names');
    const first = repo.getRankDefinitions('threshold')[0];
    expect(() => repo.editRank('threshold', first.id, 'First', 3000, 0)).toThrow('lower than');
    expect(repo.adjustPoints('balance', 'member', 100).points).toBe(100);
    expect(repo.adjustPoints('balance', 'member', -200).points).toBe(0);
    expect(() => repo.adjustPoints('balance', 'member', NaN)).toThrow('whole number');
  });
});
