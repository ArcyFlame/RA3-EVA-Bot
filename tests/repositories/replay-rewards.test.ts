import { beforeAll, describe, expect, it } from 'vitest';
import { connectDatabase } from '../../src/database/connection';
import {
  replayRatingRepository as repo,
  ReplayRatingRepository,
} from '../../src/repositories/replay-rating.repository';
import { activityRankRepository as activity } from '../../src/repositories/activity-rank.repository';
import { appSettingsRepository as settings } from '../../src/repositories/app-settings.repository';
import { replayMedal } from '../../src/utils/replay-medals';

beforeAll(connectDatabase);
let sequence = 0;
function card(guild = 'medal-board', channel = 'channel') {
  const id = ++sequence;
  const result = repo.create({
    guild_id: guild,
    channel_id: channel,
    user_id: 'author',
    source_message_id: `source${id}`,
    attachment_id: `file${id}`,
    fingerprint: id.toString(16).padStart(64, '0'),
    filename: 'test.RA3Replay',
  });
  repo.attachMessage(result.id, `message${id}`);
  repo.archive(result.id, `copy${id}`, '');
  return repo.get(result.id)!;
}
describe('replay medals and leaderboards', () => {
  it('uses configurable ascending server-local thresholds', () => {
    expect(settings.getReplayMedals('medal-default')).toEqual({
      bronze: 5,
      silver: 15,
      gold: 30,
      diamond: 50,
    });
    expect(replayMedal(4, 'medal-default')).toBe('');
    for (const [count, medal] of [
      [5, 'Bronze'],
      [15, 'Silver'],
      [30, 'Gold'],
      [50, 'Diamond'],
    ] as const)
      expect(replayMedal(count, 'medal-default')).toContain(medal);
    settings.setReplayMedals('medal-custom', { bronze: 1, silver: 2, gold: 3, diamond: 4 });
    expect(replayMedal(4, 'medal-custom')).toContain('Diamond');
    expect(replayMedal(4, 'medal-default')).toBe('');
    expect(() =>
      settings.setReplayMedals('medal-custom', { bronze: 3, silver: 2, gold: 3, diamond: 4 }),
    ).toThrow('increasing');
  });
  it('ranks at most ten archived cards by unique support, excluding other servers/channels and closed cards', () => {
    const all = Array.from({ length: 12 }, () => card());
    all.forEach((item, i) => {
      for (let n = 0; n <= i; n++) repo.vote(item.id, `voter${n}`, 1);
    });
    const closed = card();
    repo.vote(closed.id, 'voter', 1);
    repo.closeMessage(closed.card_message_id!);
    card('different-server');
    card('medal-board', 'other-channel');
    const board = repo.leaderboard('medal-board', 'channel');
    expect(board).toHaveLength(10);
    expect(board[0]).toMatchObject({ id: all[11].id, score: 12 });
    expect(
      board.every(
        (item) => item.guild_id === 'medal-board' && item.channel_id === 'channel' && !item.closed,
      ),
    ).toBe(true);
    activity.updateSettings('medal-board', { ratingMode: 'both' }, 0);
    repo.vote(all[11].id, 'negative', -1);
    expect(
      repo.leaderboard('medal-board', 'channel').find((item) => item.id === all[11].id)?.score,
    ).toBe(11);
  });
});
describe('persistent vote abuse limits', () => {
  const now = Date.now();
  it('shares cooldowns across cards and repository instances, but not across guilds', () => {
    expect(repo.claimVoteAction('guard', 'voter', 'author', 1, now)).toBeNull();
    expect(
      new ReplayRatingRepository().claimVoteAction('guard', 'voter', 'other', 2, now + 1000),
    ).toContain('3 seconds');
    expect(repo.claimVoteAction('other', 'voter', 'author', 1, now + 1000)).toBeNull();
  });
  it('limits rapid votes and daily support for one uploader', () => {
    for (let n = 0; n < 5; n++)
      expect(repo.claimVoteAction('burst', 'voter', 'author', n, now + n * 4000)).toBeNull();
    expect(repo.claimVoteAction('burst', 'voter', 'author', 6, now + 24000)).toContain('minute');
    expect(repo.claimVoteAction('burst', 'voter', 'author', 6, now + 61000)).toContain(
      'same uploader',
    );
    expect(repo.claimVoteAction('burst', 'voter', 'author', 0, now + 61000)).toBeNull();
  });
  it('limits distinct cards per day and resets the budget on the next UTC day', () => {
    const start = Date.parse(new Date(now).toISOString().slice(0, 10) + 'T01:00:00Z');
    for (let n = 0; n < 30; n++)
      expect(repo.claimVoteAction('daily', 'voter', `author${n}`, n, start + n * 61000)).toBeNull();
    expect(repo.claimVoteAction('daily', 'voter', 'author30', 30, start + 30 * 61000)).toContain(
      '30 different',
    );
    expect(repo.claimVoteAction('daily', 'voter', 'author30', 30, start + 86400000)).toBeNull();
  });
});
