import { afterEach, describe, expect, it, vi } from 'vitest';
import { TipDraftStore } from '../../src/commands/admin/tips-admin.drafts';
import { CURATED_TIPS } from '../../src/content/tips';

const scope = {
  guild: '111111111111111111',
  user: '222222222222222222',
  game: 'ra3' as const,
  id: 0,
  revision: 0,
};
afterEach(() => vi.restoreAllMocks());

describe('private tip drafts', () => {
  it('isolates drafts by user, guild, game, target and revision', () => {
    const store = new TipDraftStore();
    const token = store.create(scope, CURATED_TIPS.ra3[0]);
    expect(token).toMatch(/^[a-f0-9]{16}$/);
    for (const changed of [
      { guild: '333333333333333333' },
      { user: '333333333333333333' },
      { game: 'genevo' as const },
      { id: 1 },
      { revision: 1 },
    ])
      expect(() => store.get(token, { ...scope, ...changed })).toThrow('unavailable');
    expect(() => store.get(undefined, scope)).toThrow('unavailable');
    expect(store.get(token, scope)).toEqual(CURATED_TIPS.ra3[0]);
    store.get(token, scope).title = 'Not persisted';
    expect(store.get(token, scope).title).toBe(CURATED_TIPS.ra3[0].title);
  });
  it('expires drafts after 15 minutes and deletes consumed drafts', () => {
    const store = new TipDraftStore();
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const token = store.create(scope, CURATED_TIPS.ra3[0]);
    vi.mocked(Date.now).mockReturnValue(now + 15 * 60_000);
    expect(() => store.get(token, scope)).toThrow('expired');
    const next = store.create(scope, CURATED_TIPS.ra3[0]);
    store.remove(next);
    expect(() => store.get(next, scope)).toThrow('unavailable');
  });
  it('bounds per-user drafts and the global store', () => {
    const store = new TipDraftStore();
    const first = store.create(scope, CURATED_TIPS.ra3[0]);
    for (let i = 0; i < 5; i++) store.create(scope, CURATED_TIPS.ra3[0]);
    expect(() => store.get(first, scope)).toThrow('unavailable');
    for (let i = 0; i < 495; i++) store.create({ ...scope, user: String(i) }, CURATED_TIPS.ra3[0]);
    expect(() => store.create({ ...scope, user: 'new' }, CURATED_TIPS.ra3[0])).toThrow('Too many');
  });
});
