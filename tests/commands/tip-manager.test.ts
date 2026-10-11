import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/database/sqlite';
import { CURATED_TIPS } from '../../src/content/tips';
import { TipRepository, tipRepository } from '../../src/repositories/tip.repository';
import { handleTipManager, tipManagerView } from '../../src/commands/admin/tips-admin.view';
import { execute as openManager } from '../../src/commands/admin/tips-admin.command';
import { execute as showTip } from '../../src/commands/info/tips.command';
import type { ButtonInteraction, ChatInputCommandInteraction } from 'discord.js';
import type { RA3Bot } from '../../src/bot';

const context = vi.hoisted(() => ({ game: 'ra3' as 'ra3' | 'genevo' }));
vi.mock('../../src/utils/game-context', () => ({ getGameContext: () => ({ game: context.game }) }));
vi.mock('../../src/utils/permissions', () => ({
  isModerator: (member: { staff: boolean }) => member.staff,
}));
const guild = '111111111111111111',
  otherGuild = '222222222222222222',
  user = '333333333333333333';
function interaction(
  action: string,
  id = 1,
  revision = 0,
  kind = 'button',
  fields: Record<string, string> = {},
) {
  return {
    customId: `tipmgr:${action}:${guild}:${user}:${context.game}:${id}:${revision}`,
    guildId: guild,
    user: { id: user },
    options: { getString: () => null },
    guild: { members: { fetch: vi.fn().mockResolvedValue({ staff: true }) } },
    values: ['1'],
    fields: { getTextInputValue: (id: string) => fields[id] ?? '' },
    isButton: () => kind === 'button',
    isModalSubmit: () => kind === 'modal',
    isStringSelectMenu: () => kind === 'select',
    reply: vi.fn(),
    followUp: vi.fn(),
    update: vi.fn(),
    showModal: vi.fn(),
  };
}
const call = (i: ReturnType<typeof interaction>) =>
  handleTipManager(i as unknown as ButtonInteraction);
beforeEach(() => {
  context.game = 'ra3';
  db.exec(
    'CREATE TABLE IF NOT EXISTS app_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT); DELETE FROM app_settings;',
  );
});
describe('tip repository', () => {
  it('persists across repository instances and isolates servers and games', () => {
    const tip = { ...CURATED_TIPS.ra3[0], title: 'Server title', quote: undefined };
    tipRepository.change(guild, 'ra3', 0, 'save', 1, tip);
    expect(new TipRepository(db).list(guild, 'ra3')[0].title).toBe('Server title');
    expect(tipRepository.list(otherGuild, 'ra3')[0].origin).toBe('curated');
    expect(tipRepository.list(guild, 'genevo')[0].origin).toBe('curated');
    expect(tipRepository.list(null, 'ra3')[0].origin).toBe('curated');
  });
  it('rejects stale writes without changing data and restores built-ins', () => {
    tipRepository.change(guild, 'ra3', 0, 'remove', 1);
    expect(tipRepository.list(guild, 'ra3').some((tip) => tip.id === 1)).toBe(false);
    expect(() => tipRepository.change(guild, 'ra3', 0, 'restore', 1)).toThrow('outdated');
    tipRepository.change(guild, 'ra3', 1, 'restore', 1);
    expect(tipRepository.list(guild, 'ra3')[0]).toEqual(CURATED_TIPS.ra3[0]);
  });
  it('allocates stable custom IDs and removes custom tips without reusing IDs', () => {
    expect(tipRepository.change(guild, 'ra3', 0, 'save', 0, CURATED_TIPS.ra3[0])).toBe(1000);
    tipRepository.change(guild, 'ra3', 1, 'remove', 1000);
    expect(tipRepository.change(guild, 'ra3', 2, 'save', 0, CURATED_TIPS.ra3[0])).toBe(1001);
    expect(tipRepository.list(guild, 'ra3').some((tip) => tip.id === 1000)).toBe(false);
  });
  it('rolls back validation failure and rejects cross-game saves', () => {
    expect(() =>
      tipRepository.change(guild, 'ra3', 0, 'save', 0, {
        ...CURATED_TIPS.ra3[0],
        source: 'javascript:x',
      }),
    ).toThrow();
    expect(() =>
      tipRepository.change(guild, 'ra3', 0, 'save', 1, CURATED_TIPS.genevo[0]),
    ).toThrow();
    expect(tipRepository.revision(guild, 'ra3')).toBe(0);
    expect(tipRepository.change(guild, 'ra3', 0, 'save', 0, CURATED_TIPS.ra3[0])).toBe(1000);
  });
});
describe('staff tip interactions', () => {
  it('opens privately, and normal /tips exposes only source links', async () => {
    const i = interaction('browse');
    await openManager({} as RA3Bot, i as unknown as ChatInputCommandInteraction);
    expect(i.reply.mock.calls[0][0].ephemeral).toBe(true);
    const publicI = interaction('browse');
    await showTip({} as RA3Bot, publicI as unknown as ChatInputCommandInteraction);
    expect(
      publicI.reply.mock.calls[0][0].components[0].components.every(
        (c: ButtonInteraction) => c.toJSON().style === 5,
      ),
    ).toBe(true);
  });
  it.each([
    'add',
    'edit',
    'quote',
    'remove',
    'confirm',
    'restore',
    'save',
    'savequote',
    'select',
    'faction',
    'browse',
  ])('rechecks live staff privileges for %s', async (action) => {
    const i = interaction(action);
    i.guild.members.fetch.mockResolvedValue({ staff: false });
    await call(i);
    expect(i.guild.members.fetch).toHaveBeenCalledWith({ user, force: true });
    expect(i.reply.mock.calls[0][0].ephemeral).toBe(true);
    expect(i.update).not.toHaveBeenCalled();
    expect(i.showModal).not.toHaveBeenCalled();
    expect(tipRepository.revision(guild, 'ra3')).toBe(0);
  });
  it('fails closed when member lookup fails', async () => {
    const i = interaction('edit');
    i.guild.members.fetch.mockRejectedValue(new Error('unavailable'));
    await call(i);
    expect(i.showModal).not.toHaveBeenCalled();
  });
  it.each(['user', 'guild', 'game', 'revision', 'malformed'])(
    'rejects a wrong %s binding',
    async (binding) => {
      const i = interaction('confirm');
      if (binding === 'user') i.user.id = '444444444444444444';
      if (binding === 'guild') i.guildId = otherGuild;
      if (binding === 'game') i.customId = i.customId.replace(':ra3:', ':genevo:');
      if (binding === 'revision') i.customId = i.customId.replace(/:0$/, ':99');
      if (binding === 'malformed') i.customId += ':extra';
      await call(i);
      expect(i.update).not.toHaveBeenCalled();
      expect(tipRepository.revision(guild, 'ra3')).toBe(0);
    },
  );
  it.each(['add', 'edit', 'quote'])('opens the %s modal within Discord limits', async (action) => {
    const i = interaction(action, action === 'add' ? 0 : 1);
    await call(i);
    const modal = i.showModal.mock.calls[0][0].toJSON();
    expect(modal.custom_id.length).toBeLessThanOrEqual(100);
    expect(modal.components).toHaveLength(3);
  });
  it('asks before removal and allows cancellation', async () => {
    const i = interaction('remove');
    await call(i);
    expect(i.update.mock.calls[0][0].content).toContain('Remove Tip #1');
    expect(tipRepository.revision(guild, 'ra3')).toBe(0);
    const cancel = interaction('browse');
    await call(cancel);
    expect(cancel.update).toHaveBeenCalled();
    const confirm = interaction('confirm');
    await call(confirm);
    expect(tipRepository.isDisabled(guild, 'ra3', 1)).toBe(true);
  });
  it('edits content without retaining an unrelated quote, then saves/removes an explicit quote', async () => {
    await call(
      interaction('save', 1, 0, 'modal', {
        title: 'Economy',
        text: 'Protect your refinery.',
        source: 'https://example.com/rules',
      }),
    );
    expect(tipRepository.list(guild, 'ra3')[0].quote).toBeUndefined();
    await call(
      interaction('savequote', 1, 1, 'modal', {
        quote: 'Actual line',
        speaker: 'Unit',
        source: 'https://example.com/quotes',
      }),
    );
    expect(tipRepository.list(guild, 'ra3')[0].quote?.text).toBe('Actual line');
    await call(interaction('savequote', 1, 2, 'modal', { quote: '' }));
    expect(tipRepository.list(guild, 'ra3')[0].quote).toBeUndefined();
  });
  it('validates select values and applies the chosen faction', async () => {
    const bad = interaction('select', 1, 0, 'select');
    bad.values = ['999'];
    await call(bad);
    expect(bad.update).not.toHaveBeenCalled();
    const good = interaction('faction', 1, 0, 'select');
    good.values = ['soviets'];
    await call(good);
    expect(tipRepository.list(guild, 'ra3')[0].faction).toBe('soviets');
  });
  it('paginates past 25 and caps component rows/IDs', () => {
    for (let n = 0; n < 30; n++)
      tipRepository.change(guild, 'ra3', n, 'save', 0, CURATED_TIPS.ra3[0]);
    for (const selected of [1, 1029]) {
      const view = tipManagerView(guild, user, 'ra3', selected);
      expect(view.components).toHaveLength(5);
      for (const row of view.components)
        for (const component of row.components) {
          const data = component.toJSON();
          if ('custom_id' in data) expect(data.custom_id.length).toBeLessThanOrEqual(100);
          if ('options' in data) expect(data.options.length).toBeLessThanOrEqual(25);
        }
    }
  });
});
