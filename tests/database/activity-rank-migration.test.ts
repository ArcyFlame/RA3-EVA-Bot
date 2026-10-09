import { afterAll, describe, expect, it } from 'vitest';
import { db } from '../../src/database/sqlite';
import { up as createLegacyActivity } from '../../src/database/migrations/031_activity_ranks';
import { up as upgradeActivity } from '../../src/database/migrations/032_configurable_activity_ranks';
import { ActivityRankRepository } from '../../src/repositories/activity-rank.repository';

afterAll(() => db.close());

describe('activity rank migration', () => {
  it('preserves role mappings, earned ping XP and daily anti-spam claims', () => {
    db.exec('CREATE TABLE guilds (guild_id TEXT PRIMARY KEY)');
    createLegacyActivity();
    db.prepare(
      'INSERT INTO activity_rank_roles (guild_id, rank, role_id, threshold) VALUES (?, ?, ?, ?)',
    ).run('legacy', 1, '111111111111111111', 100);
    db.prepare(
      `INSERT INTO member_activity
      (guild_id, user_id, points, qualifying_messages, qualifying_cnc_pings, last_cnc_ping_date)
      VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('legacy', 'member', 95, 2, 3, '2026-10-09');
    db.prepare(
      `INSERT INTO activity_daily_totals
      (guild_id, user_id, activity_date, message_awards, cnc_ping_awarded)
      VALUES (?, ?, ?, ?, ?)`,
    ).run('legacy', 'member', '2026-10-09', 2, 1);

    db.transaction(upgradeActivity)();
    const repository = new ActivityRankRepository();
    expect(repository.getRankDefinitions('legacy')).toHaveLength(9);
    expect(repository.getRankDefinitions('legacy')[0]).toMatchObject({
      roleId: '111111111111111111',
      title: 'Private',
      threshold: 1250,
    });
    expect(repository.getMember('legacy', 'member')).toMatchObject({
      points: 75,
      qualifyingCncPings: 3,
      qualifyingReplays: 0,
    });
    expect(
      repository.recordActivity({
        guildId: 'legacy',
        userId: 'member',
        activityDate: '2026-10-09',
        hasCncPing: true,
        replayFingerprints: [],
      }).pointsAwarded,
    ).toBe(0);
    expect(
      repository.recordActivity({
        guildId: 'legacy',
        userId: 'member',
        activityDate: '2026-10-10',
        hasCncPing: true,
        replayFingerprints: [],
      }).pointsAwarded,
    ).toBe(25);
  });
});
