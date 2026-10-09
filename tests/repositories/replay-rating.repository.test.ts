import { beforeAll, describe, expect, it } from 'vitest';
import { connectDatabase } from '../../src/database/connection';
import { ReplayRatingRepository } from '../../src/repositories/replay-rating.repository';
import { activityRankRepository as activity } from '../../src/repositories/activity-rank.repository';
const repo = new ReplayRatingRepository();
let n = 0;
beforeAll(async () => {
  await connectDatabase();
});
const create = (guild = 'ratings' + ++n, fingerprint = (++n).toString(16).padStart(64, '0')) =>
  repo.create({
    guild_id: guild,
    user_id: 'author',
    channel_id: 'channel',
    source_message_id: 'source',
    attachment_id: 'file',
    fingerprint,
    filename: 'game.RA3Replay',
  });
describe('durable replay rating ledger', () => {
  it('deduplicates replay cards across members and isolates servers', () => {
    const card = create();
    expect(repo.create({ ...card, user_id: 'someone-else' }).id).toBe(card.id);
    expect(create('another', card.fingerprint).id).not.toBe(card.id);
  });
  it('needs two net positive votes and never rewards self votes', () => {
    const card = create();
    expect(repo.vote(card.id, 'author', 1)).toBe(0);
    expect(repo.vote(card.id, 'a', 1)).toBe(0);
    expect(repo.vote(card.id, 'b', 1)).toBe(10);
    expect(repo.totals(card.id)).toEqual({ up: 2, down: 0 });
    expect(activity.getMember(card.guild_id, 'author')?.points).toBe(10);
  });
  it('persists one latest vote per person and does not farm switching or remove/re-add', () => {
    const card = create();
    repo.vote(card.id, 'a', 1);
    repo.vote(card.id, 'b', 1);
    for (let i = 0; i < 20; i++) {
      expect(repo.vote(card.id, 'b', -1)).toBe(0);
      expect(repo.vote(card.id, 'b', 1)).toBe(0);
      expect(repo.vote(card.id, 'b', 1, true)).toBe(0);
      expect(repo.vote(card.id, 'b', 1)).toBe(0);
    }
    expect(repo.get(card.id)?.bonus_awarded).toBe(10);
    expect(new ReplayRatingRepository().vote(card.id, 'b', 1)).toBe(0);
    expect(repo.vote(card.id, 'c', 1)).toBe(5);
  });
  it('does not remove a newer positive vote when the old negative reaction is removed', () => {
    const card = create();
    repo.vote(card.id, 'a', -1);
    repo.vote(card.id, 'a', 1);
    repo.vote(card.id, 'a', -1, true);
    expect(repo.totals(card.id)).toEqual({ up: 1, down: 0 });
  });
  it('caps bonus per replay and per uploader/day without deferring old votes to tomorrow', () => {
    const card = create();
    activity.updateSettings(card.guild_id, { ratingDailyCap: 12, ratingReplayCap: 20 }, 0);
    repo.vote(card.id, 'a', 1);
    expect(repo.vote(card.id, 'b', 1)).toBe(10);
    expect(repo.vote(card.id, 'c', 1)).toBe(2);
    expect(repo.vote(card.id, 'd', 1)).toBe(0);
    expect(repo.vote(card.id, 'd', 1, false, '2030-01-01')).toBe(0);
    expect(repo.vote(card.id, 'e', 1, false, '2030-01-01')).toBe(5);
    expect(repo.vote(card.id, 'f', 1, false, '2030-01-01')).toBe(3);
    expect(repo.vote(card.id, 'g', 1, false, '2030-01-01')).toBe(0);
    expect(repo.get(card.id)?.bonus_awarded).toBe(20);
  });
  it('keeps anti-farming history after resetting member XP or clearing reactions', () => {
    const card = create();
    repo.attachMessage(card.id, 'reset-message');
    repo.vote(card.id, 'a', 1);
    repo.vote(card.id, 'b', 1);
    activity.resetMember(card.guild_id, 'author');
    repo.clearVotes('reset-message');
    expect(repo.vote(card.id, 'a', 1)).toBe(0);
    expect(repo.vote(card.id, 'b', 1)).toBe(0);
    expect(activity.getMember(card.guild_id, 'author')?.points).toBe(0);
  });
  it('respects disabled ratings, closed cards and persistent scan cooldowns', () => {
    const card = create();
    repo.attachMessage(card.id, 'closed-message');
    activity.updateSettings(card.guild_id, { ratingsEnabled: false }, 0);
    expect(repo.vote(card.id, 'a', 1)).toBe(0);
    expect(repo.totals(card.id).up).toBe(0);
    activity.updateSettings(card.guild_id, { ratingsEnabled: true }, 1);
    repo.closeMessage('closed-message');
    expect(repo.vote(card.id, 'a', 1)).toBe(0);
    expect(repo.claimScan(card.guild_id, 1000000)).toBe(true);
    expect(new ReplayRatingRepository().claimScan(card.guild_id, 1000001)).toBe(false);
    expect(repo.claimScan(card.guild_id, 1600000)).toBe(true);
  });
  it('validates limits atomically and rejects invalid fingerprints', () => {
    const card = create();
    expect(() => activity.updateSettings(card.guild_id, { ratingPoints: 0 }, 0)).toThrow();
    expect(activity.getSettings(card.guild_id).version).toBe(0);
    expect(() => create('bad', '../')).toThrow();
  });
});
