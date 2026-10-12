import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectDatabase } from '../../src/database/connection';
import { db } from '../../src/database/sqlite';
import {
  TipSettingsRepository,
  tipSettingsRepository,
} from '../../src/repositories/tip-settings.repository';
import { data, execute } from '../../src/commands/info/tips.command';
import { FEATURE_DEFINITIONS, setFeatureState } from '../../src/commands/setup/feature-toggle.view';

const context = vi.hoisted(() => ({ game: 'ra3' as 'ra3' | 'genevo' }));
vi.mock('../../src/utils/game-context', () => ({ getGameContext: () => ({ game: context.game }) }));
const guild = '111111111111111111';
beforeAll(connectDatabase);
beforeEach(() => {
  context.game = 'ra3';
  db.prepare('DELETE FROM app_settings WHERE key LIKE ?').run('tip-settings:%');
});
function fixture(guildId: string | null = guild) {
  return { guildId, options: { getString: vi.fn(() => 'public') }, reply: vi.fn() } as any;
}

describe('server-controlled tip visibility', () => {
  it.each(['ra3', 'genevo'] as const)('defaults to a public reply for %s', async (game) => {
    context.game = game;
    const i = fixture();
    await execute({} as any, i);
    expect(i.reply.mock.calls[0][0].ephemeral).toBe(false);
    expect(i.reply.mock.calls[0][0].embeds).toHaveLength(1);
    expect(data.toJSON().options).toHaveLength(0);
  });
  it.each(['ra3', 'genevo'] as const)(
    'staff can set private replies for %s without a user override',
    async (game) => {
      context.game = game;
      tipSettingsRepository.setVisibility(guild, 'private');
      const i = fixture();
      await execute({} as any, i);
      expect(i.reply.mock.calls[0][0].ephemeral).toBe(true);
      expect(i.options.getString).not.toHaveBeenCalled();
      expect(tipSettingsRepository.get('222222222222222222').visibility).toBe('public');
      expect(new TipSettingsRepository(db).get(guild).visibility).toBe('private');
      tipSettingsRepository.setVisibility(guild, 'public');
      const publicReply = fixture();
      await execute({} as any, publicReply);
      expect(publicReply.reply.mock.calls[0][0].ephemeral).toBe(false);
    },
  );
  it('disables tips without forgetting the staff-selected visibility', async () => {
    tipSettingsRepository.setVisibility(guild, 'private');
    setFeatureState(guild, 'tips', false);
    const i = fixture();
    await execute({} as any, i);
    expect(i.reply.mock.calls[0][0].embeds).toBeUndefined();
    expect(i.reply.mock.calls[0][0].ephemeral).toBe(true);
    setFeatureState(guild, 'tips', true);
    expect(tipSettingsRepository.get(guild)).toEqual({ enabled: true, visibility: 'private' });
    expect(
      FEATURE_DEFINITIONS.some((feature) => ['tipsPrivate', 'tipsPublic'].includes(feature.key)),
    ).toBe(false);
  });
  it.each([
    [true, true, true, 'public'],
    [true, false, true, 'private'],
    [false, true, true, 'public'],
    [false, false, false, 'private'],
  ])('reads legacy private=%s public=%s safely', (privateMode, publicMode, enabled, visibility) => {
    db.prepare('INSERT INTO app_settings(key,value) VALUES(?,?)').run(
      `tip-settings:${guild}`,
      JSON.stringify({ enabled: true, private: privateMode, public: publicMode }),
    );
    expect(tipSettingsRepository.get(guild)).toEqual({ enabled, visibility });
  });
  it('keeps previously disabled tips disabled', () => {
    db.prepare('INSERT INTO app_settings(key,value) VALUES(?,?)').run(
      `tip-settings:${guild}`,
      JSON.stringify({ enabled: false, private: true, public: true }),
    );
    tipSettingsRepository.setVisibility(guild, 'private');
    expect(tipSettingsRepository.get(guild)).toEqual({ enabled: false, visibility: 'private' });
  });
  it.each(['{}', 'null', 'broken', '{"enabled":true,"visibility":"everyone"}'])(
    'fails closed for malformed settings: %s',
    async (value) => {
      db.prepare('INSERT INTO app_settings(key,value) VALUES(?,?)').run(
        `tip-settings:${guild}`,
        value,
      );
      const i = fixture();
      await execute({} as any, i);
      expect(i.reply.mock.calls[0][0].embeds).toBeUndefined();
      expect(i.reply.mock.calls[0][0].ephemeral).toBe(true);
    },
  );
  it('keeps direct-message replies private when DM commands are enabled', async () => {
    const i = fixture(null);
    await execute({} as any, i);
    expect(i.reply.mock.calls[0][0].ephemeral).toBe(true);
    expect(i.reply.mock.calls[0][0].embeds).toHaveLength(1);
  });
});
