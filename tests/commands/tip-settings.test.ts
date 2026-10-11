import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectDatabase } from '../../src/database/connection';
import { db } from '../../src/database/sqlite';
import { tipSettingsRepository } from '../../src/repositories/tip-settings.repository';
import { execute } from '../../src/commands/info/tips.command';
import { setFeatureState } from '../../src/commands/setup/feature-toggle.view';

const guild = '111111111111111111';
beforeAll(connectDatabase);
beforeEach(() => db.prepare('DELETE FROM app_settings WHERE key LIKE ?').run('tip-settings:%'));
function fixture(visibility: string | null = null, guildId: string | null = guild) {
  return { guildId, options: { getString: () => visibility }, reply: vi.fn() } as any;
}
describe('tip visibility settings', () => {
  it('defaults to a private reply and supports explicit public replies', async () => {
    const privateReply = fixture();
    await execute({} as any, privateReply);
    expect(privateReply.reply.mock.calls[0][0].ephemeral).toBe(true);
    const publicReply = fixture('public');
    await execute({} as any, publicReply);
    expect(publicReply.reply.mock.calls[0][0].ephemeral).toBe(false);
  });
  it('independently disables private, public, and all tips per guild', async () => {
    setFeatureState(guild, 'tipsPublic', false);
    const rejected = fixture('public');
    await execute({} as any, rejected);
    expect(rejected.reply.mock.calls[0][0].embeds).toBeUndefined();
    expect(tipSettingsRepository.get('222222222222222222').public).toBe(true);
    setFeatureState(guild, 'tipsPublic', true);
    setFeatureState(guild, 'tipsPrivate', false);
    const onlyPublic = fixture();
    await execute({} as any, onlyPublic);
    expect(onlyPublic.reply.mock.calls[0][0].ephemeral).toBe(false);
    setFeatureState(guild, 'tips', false);
    const disabled = fixture();
    await execute({} as any, disabled);
    expect(disabled.reply.mock.calls[0][0].embeds).toBeUndefined();
  });
  it('does not send a public response for a disabled or malformed mode', async () => {
    for (const value of ['constructor', 'toString', 'public']) {
      const i = fixture(value, value === 'public' ? null : guild);
      await execute({} as any, i);
      expect(i.reply.mock.calls[0][0].ephemeral).toBe(true);
      expect(i.reply.mock.calls[0][0].embeds).toBeUndefined();
    }
    db.prepare('INSERT INTO app_settings(key,value) VALUES(?,?)').run(
      `tip-settings:${guild}`,
      '{}',
    );
    const i = fixture();
    await execute({} as any, i);
    expect(i.reply.mock.calls[0][0].embeds).toBeUndefined();
  });
});
