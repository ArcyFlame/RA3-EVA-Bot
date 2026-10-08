import { beforeAll, describe, expect, it } from 'vitest';
import { connectDatabase } from '../../src/database/connection';
import {
  ActivityRankRepository,
  CNC_PING_POINTS,
  MAX_DAILY_MESSAGE_AWARDS,
  MESSAGE_POINTS,
} from '../../src/repositories/activity-rank.repository';

const repo = new ActivityRankRepository();

beforeAll(async () => {
  await connectDatabase();
});

describe('ActivityRankRepository — anti-spam scoring', () => {
  it('counts a C&C ping only once per member per UTC day', () => {
    const guildId = 'activity-ping-guild';
    const userId = 'activity-ping-user';
    const start = Date.UTC(2026, 9, 9, 12, 0, 0);

    const first = repo.recordActivity({
      guildId,
      userId,
      nowMs: start,
      activityDate: '2026-10-09',
      meaningfulMessage: true,
      fingerprint: 'same-ping',
      hasCncPing: true,
    });
    expect(first.pointsAwarded).toBe(MESSAGE_POINTS + CNC_PING_POINTS);
    expect(first.cncPingAwarded).toBe(true);

    for (let index = 1; index < 15; index += 1) {
      const spam = repo.recordActivity({
        guildId,
        userId,
        nowMs: start + index * 1_000,
        activityDate: '2026-10-09',
        meaningfulMessage: true,
        fingerprint: 'same-ping',
        hasCncPing: true,
      });
      expect(spam.pointsAwarded).toBe(0);
      expect(spam.cncPingAwarded).toBe(false);
    }

    const afterSpam = repo.getMember(guildId, userId)!;
    expect(afterSpam.qualifyingCncPings).toBe(1);
    expect(afterSpam.qualifyingMessages).toBe(1);

    const nextDay = repo.recordActivity({
      guildId,
      userId,
      nowMs: start + 24 * 60 * 60 * 1_000,
      activityDate: '2026-10-10',
      meaningfulMessage: false,
      hasCncPing: true,
    });
    expect(nextDay.pointsAwarded).toBe(CNC_PING_POINTS);
    expect(nextDay.cncPingAwarded).toBe(true);
    expect(repo.getMember(guildId, userId)?.qualifyingCncPings).toBe(2);
  });

  it('blocks repeated content after the minute cooldown', () => {
    const guildId = 'activity-duplicate-guild';
    const userId = 'activity-duplicate-user';
    const start = Date.UTC(2026, 9, 9, 8, 0, 0);
    repo.recordActivity({
      guildId,
      userId,
      nowMs: start,
      activityDate: '2026-10-09',
      meaningfulMessage: true,
      fingerprint: 'repeated',
      hasCncPing: false,
    });

    const duplicate = repo.recordActivity({
      guildId,
      userId,
      nowMs: start + 61_000,
      activityDate: '2026-10-09',
      meaningfulMessage: true,
      fingerprint: 'repeated',
      hasCncPing: false,
    });
    expect(duplicate.messageAwarded).toBe(false);
    expect(duplicate.messageBlockedBy).toBe('duplicate');

    const fresh = repo.recordActivity({
      guildId,
      userId,
      nowMs: start + 122_000,
      activityDate: '2026-10-09',
      meaningfulMessage: true,
      fingerprint: 'different',
      hasCncPing: false,
    });
    expect(fresh.messageAwarded).toBe(true);
    expect(repo.getMember(guildId, userId)?.points).toBe(MESSAGE_POINTS * 2);
  });

  it('enforces the daily message-award cap', () => {
    const guildId = 'activity-cap-guild';
    const userId = 'activity-cap-user';
    const start = Date.UTC(2026, 9, 9, 0, 0, 0);
    for (let index = 0; index < MAX_DAILY_MESSAGE_AWARDS; index += 1) {
      const result = repo.recordActivity({
        guildId,
        userId,
        nowMs: start + index * 61_000,
        activityDate: '2026-10-09',
        meaningfulMessage: true,
        fingerprint: `message-${index}`,
        hasCncPing: false,
      });
      expect(result.messageAwarded).toBe(true);
    }

    const capped = repo.recordActivity({
      guildId,
      userId,
      nowMs: start + MAX_DAILY_MESSAGE_AWARDS * 61_000,
      activityDate: '2026-10-09',
      meaningfulMessage: true,
      fingerprint: 'one-too-many',
      hasCncPing: false,
    });
    expect(capped.messageAwarded).toBe(false);
    expect(capped.messageBlockedBy).toBe('daily_cap');
    expect(repo.getMember(guildId, userId)?.qualifyingMessages).toBe(MAX_DAILY_MESSAGE_AWARDS);
  });
});

describe('ActivityRankRepository — configuration and moderation', () => {
  it('stores rank roles and moves a duplicate role to its latest rank', () => {
    const guildId = 'activity-role-guild';
    repo.setRankRole(guildId, 1, 'role-one', 10);
    repo.setRankRole(guildId, 2, 'role-one', 250);
    const definitions = repo.getRankDefinitions(guildId);
    expect(definitions.find((rank) => rank.rank === 1)?.roleId).toBeUndefined();
    expect(definitions.find((rank) => rank.rank === 2)?.roleId).toBe('role-one');
  });

  it('adjusts points without allowing a negative balance and can reset a member', () => {
    const guildId = 'activity-adjust-guild';
    const userId = 'activity-adjust-user';
    expect(repo.adjustPoints(guildId, userId, 100).points).toBe(100);
    expect(repo.adjustPoints(guildId, userId, -150).points).toBe(0);
    repo.resetMember(guildId, userId);
    expect(repo.getMember(guildId, userId)).toBeUndefined();
  });
});
