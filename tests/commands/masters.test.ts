import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/database/sqlite';
import { masterRepository } from '../../src/repositories/master.repository';
import {
  masterRosterRepository as roster,
  MasterRosterRepository,
} from '../../src/repositories/master-roster.repository';
import { handleMasters, mastersView } from '../../src/commands/info/masters-manager.view';
import { execute } from '../../src/commands/info/masters.command';
import { buildMastersEmbed, buildMastersList } from '../../src/commands/info/masters.view';
import { StatsView } from '../../src/commands/stats/stats.view';
import type { RA3Stats } from '../../src/services/ra3-stats.service';
import type { ButtonInteraction, ChatInputCommandInteraction } from 'discord.js';
import type { RA3Bot } from '../../src/bot';

const context = vi.hoisted(() => ({ game: 'ra3' as 'ra3' | 'genevo', mastersEnabled: true }));
vi.mock('../../src/utils/game-context', () => ({ getGameContext: () => context }));
vi.mock('../../src/utils/permissions', () => ({
  isModerator: (member: { staff: boolean }) => member.staff,
}));
const guild = '111111111111111111',
  other = '222222222222222222',
  user = '333333333333333333';
beforeEach(() => {
  context.game = 'ra3';
  context.mastersEnabled = true;
  db.exec(`CREATE TABLE IF NOT EXISTS app_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT);
    CREATE TABLE IF NOT EXISTS masters(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT,year INTEGER,patch TEXT,game TEXT);
    DELETE FROM app_settings; DELETE FROM masters;`);
  masterRepository.create('Original', 2020, '1.12', 'ra3');
});
function interaction(
  action = 'add',
  id = 0,
  kind = 'button',
  staff = true,
  fields: Record<string, string> = {},
) {
  return {
    customId: `masters:${action}:${guild}:${user}:${context.game}:${id}:${roster.snapshot(guild, context.game).revision}:0`,
    guildId: guild,
    user: { id: user },
    guild: { members: { fetch: vi.fn().mockResolvedValue({ staff }) } },
    isButton: () => kind === 'button',
    isModalSubmit: () => kind === 'modal',
    isStringSelectMenu: () => kind === 'select',
    fields: { getTextInputValue: (key: string) => fields[key] ?? '' },
    values: [String(id)],
    reply: vi.fn(),
    followUp: vi.fn(),
    update: vi.fn(),
    showModal: vi.fn(),
    deferReply: vi.fn(),
    editReply: vi.fn(),
  };
}
const call = (i: ReturnType<typeof interaction>) =>
  handleMasters(i as unknown as ButtonInteraction);

describe('Hall of Fame formatting', () => {
  it.each(['ra3', 'genevo'] as const)(
    'adds a branded header and clear year groups for %s',
    (game) => {
      const embed = buildMastersList(
        [
          { id: 1, name: 'Alpha', year: 2025 },
          { id: 2, name: 'Beta', year: 2025 },
          { id: 3, name: 'Gamma', year: 2009, patch: '1.10' },
        ],
        game,
      )[0].toJSON();
      expect(embed.title).toBe('🏆 Hall of Fame');
      expect(embed.author?.name).toBe(game === 'ra3' ? 'Red Alert 3' : 'Generals Evolution');
      expect(embed.author?.icon_url).toContain(
        game === 'ra3' ? '1558460619194368070' : '1558460709472305264',
      );
      expect(embed.description).toContain(
        '**3** experts  ·  **2** recorded years  ·  **2009 - 2025**',
      );
      expect(embed.description).toContain(
        '__**2025**__  ·  *2 experts*\n> • **Alpha**\n> • **Beta**',
      );
      expect(embed.description).toContain(
        '__**2009**__  ·  *1 expert*\n> • **Gamma** | Patch 1.10',
      );
      expect(embed.description).not.toContain('🥇');
      expect(embed.description).not.toContain('🛠');
    },
  );
  it('keeps an empty Hall of Fame tidy without a bogus year range', () => {
    const embed = buildMastersList([], 'genevo')[0].toJSON();
    expect(embed.description).toContain('No experts recorded yet.');
    expect(embed.description).not.toMatch(/undefined|NaN|0 recorded years/);
  });
  it('keeps every entry in a continuous list, newest year first', () => {
    const entries = Array.from({ length: 250 }, (_, index) => ({
      id: index + 1,
      name: `Master${index.toString().padStart(3, '0')}` + '*'.repeat(40),
      year: 2008 + (index % 18),
      patch: '*'.repeat(50),
    }));
    const embeds = buildMastersList(entries);
    const text = embeds.map((e) => e.toJSON().description).join('\n');
    expect(embeds.length).toBeGreaterThan(1);
    for (const entry of entries) expect(text.split(entry.name.slice(0, 9))).toHaveLength(2);
    expect(text.indexOf('**2025**')).toBeLessThan(text.indexOf('**2008**'));
    for (const embed of embeds) {
      expect(embed.toJSON().description!.length).toBeLessThanOrEqual(4096);
      expect(embed.length).toBeLessThanOrEqual(6000);
      expect(embed.toJSON().fields).toBeUndefined();
    }
  });
  it('shows a long stats list instead of cutting it at 1024 characters', () => {
    const entries = Array.from({ length: 60 }, (_, id) => ({
      id,
      name: `Master ${id}`,
      year: 2024,
      patch: '1.12.8',
    }));
    const view = new StatsView({ masters: entries, tournament_wins: {} } as RA3Stats);
    view.setPage(3);
    const embed = view.getEmbed().toJSON();
    expect(embed.description!.length).toBeGreaterThan(1024);
    expect(embed.description).toContain('Master 59');
    expect(embed.description).not.toContain('complete list');
  });
  it('points oversized stats rosters to the full list without breaking a line', () => {
    const entries = Array.from({ length: 250 }, (_, id) => ({
      id,
      name: `Master ${id}`.padEnd(50, 'a'),
      year: 2024,
      patch: '1.12.8',
    }));
    const view = new StatsView({ masters: entries, tournament_wins: {} } as RA3Stats);
    view.setPage(3);
    const embed = view.getEmbed().toJSON();
    expect(embed.description!.length).toBeLessThanOrEqual(4096);
    expect(embed.description).toContain('Use /experts to see the complete list.');
  });
  it.each(['ra3', 'genevo'] as const)('uses bullets and patch separators for %s', (game) => {
    const embed = buildMastersEmbed(
      [
        { id: 1, name: 'Alpha', year: 2020, patch: '1.12' },
        { id: 2, name: 'Beta', year: 2020, patch: 'Patch 1.13' },
        { id: 3, name: 'Gamma', year: 2020 },
      ],
      game,
    ).toJSON();
    expect(embed.title).toMatch(/^🏅 .* Hall of Fame$/);
    expect(embed.fields?.[0]).toMatchObject({
      name: '🏆 2020',
      value: '• **Alpha** | Patch 1.12\n• **Beta** | Patch 1.13\n• **Gamma**',
    });
    expect(JSON.stringify(embed)).not.toMatch(/🥇|🛠️/);
  });
});

describe('server masters storage', () => {
  it('copies defaults on first customization without changing any other server or game', () => {
    const initial = roster.snapshot(guild, 'ra3');
    roster.change(guild, 'ra3', initial.revision, 0, {
      name: 'Local',
      year: 2021,
      patch: '1.12.8',
    });
    expect(new MasterRosterRepository().snapshot(guild, 'ra3').entries).toHaveLength(2);
    expect(roster.snapshot(other, 'ra3').entries).toEqual(initial.entries);
    expect(masterRepository.getAll('ra3')).toEqual(initial.entries);
    expect(roster.snapshot(guild, 'genevo').entries).toEqual([]);
  });
  it('updates exact entries and allows distinct years/patches for the same master', () => {
    let state = roster.snapshot(guild, 'ra3');
    const id = roster.change(guild, 'ra3', state.revision, 0, { name: 'Original', year: 2022 });
    state = roster.snapshot(guild, 'ra3');
    roster.change(guild, 'ra3', state.revision, id, {
      name: 'Renamed',
      year: 2023,
      patch: '1.12.8',
    });
    state = roster.snapshot(guild, 'ra3');
    expect(state.entries.find((entry) => entry.id === id)?.name).toBe('Renamed');
    roster.change(guild, 'ra3', state.revision, id);
    expect(roster.snapshot(guild, 'ra3').entries.map((entry) => entry.name)).toEqual(['Original']);
  });
  it('blocks duplicates, stale edits and invalid values without changing saved data', () => {
    const state = roster.snapshot(guild, 'ra3');
    for (const value of [
      { name: '', year: 2020 },
      { name: 'Test', year: 1999 },
      { name: 'Test', year: 2020, patch: 'x'.repeat(51) },
      { name: 'Original', year: 2020, patch: '1.12' },
    ])
      expect(() => roster.change(guild, 'ra3', state.revision, 0, value)).toThrow();
    expect(roster.snapshot(guild, 'ra3')).toEqual(state);
    roster.change(guild, 'ra3', state.revision, 0, { name: 'One', year: 2020 });
    expect(() =>
      roster.change(guild, 'ra3', state.revision, 0, { name: 'Two', year: 2020 }),
    ).toThrow('outdated');
  });
});

describe('masters controls', () => {
  it.each([true, false])('shows management controls only to staff=%s', async (staff) => {
    const i = interaction('add', 0, 'button', staff);
    await execute({} as RA3Bot, i as unknown as ChatInputCommandInteraction);
    expect(i.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    const view = JSON.stringify(i.editReply.mock.calls[0][0]);
    if (staff) expect(view).toContain('Manage Experts');
    else expect(view).not.toContain('Manage Experts');
    expect(view).not.toContain('Next');
  });
  it('allows adding to an empty enabled GenEvo roster and honors the disabled feature', async () => {
    context.game = 'genevo';
    expect(JSON.stringify(mastersView(guild, user, 'genevo', true))).toContain('Add Expert');
    context.mastersEnabled = false;
    const i = interaction();
    await call(i);
    expect(i.showModal).not.toHaveBeenCalled();
    expect(i.reply.mock.calls[0][0].content).toContain('disabled');
  });
  it.each(['manage', 'select', 'add', 'edit', 'save', 'remove', 'confirm', 'cancel'])(
    'rechecks permissions on %s',
    async (action) => {
      const i = interaction(action, 0, action === 'save' ? 'modal' : 'button', false);
      await call(i);
      expect(i.guild.members.fetch).toHaveBeenCalledWith({ user, force: true });
      expect(i.reply.mock.calls[0][0].content).toContain('Only server admins and moderators');
      expect(i.showModal).not.toHaveBeenCalled();
      expect(i.update).not.toHaveBeenCalled();
    },
  );
  it('opens staff editing privately without replacing the full list', async () => {
    const i = interaction('manage');
    await call(i);
    expect(i.reply.mock.calls[0][0].ephemeral).toBe(true);
    expect(JSON.stringify(i.reply.mock.calls[0][0])).toContain('Add Expert');
    expect(i.update).not.toHaveBeenCalled();
  });
  it('sends long lists as private continuations without next/previous buttons', async () => {
    for (let index = 0; index < 40; index++)
      masterRepository.create(`Master${index}` + '*'.repeat(40), 2024, '*'.repeat(50), 'ra3');
    const i = interaction('add', 0, 'button', false);
    await execute({} as RA3Bot, i as unknown as ChatInputCommandInteraction);
    expect(i.followUp).toHaveBeenCalled();
    const messages = [
      i.editReply.mock.calls[0][0],
      ...i.followUp.mock.calls.map((call) => call[0]),
    ];
    const text = messages.map((m) => m.embeds[0].toJSON().description).join('\n');
    expect(text).toContain('Master39');
    expect(text).toContain('Original');
    expect(i.editReply.mock.calls[0][0].components).toEqual([]);
    for (const [message] of i.followUp.mock.calls) expect(message.ephemeral).toBe(true);
  });
  it.each(['user', 'guild', 'game', 'revision'])('rejects wrong %s binding', async (binding) => {
    const i = interaction();
    if (binding === 'user') i.user.id = other;
    if (binding === 'guild') i.guildId = other;
    if (binding === 'game') i.customId = i.customId.replace(':ra3:', ':genevo:');
    if (binding === 'revision')
      i.customId = i.customId.replace(roster.snapshot(guild, 'ra3').revision, '000000000000');
    await call(i);
    expect(i.showModal).not.toHaveBeenCalled();
  });
  it('opens a three-field form, saves privately, edits and confirms removal', async () => {
    const add = interaction();
    await call(add);
    const form = add.showModal.mock.calls[0][0].toJSON();
    expect(form.custom_id.length).toBeLessThanOrEqual(100);
    expect(
      form.components.flatMap((row: any) => row.components).map((field: any) => field.custom_id),
    ).toEqual(['name', 'year', 'patch']);
    const save = interaction('save', 0, 'modal', true, {
      name: 'New Master',
      year: '2024',
      patch: '1.12.8',
    });
    await call(save);
    expect(save.reply.mock.calls[0][0].ephemeral).toBe(true);
    const entry = roster.snapshot(guild, 'ra3').entries.find((item) => item.name === 'New Master')!;
    const edit = interaction('edit', entry.id);
    await call(edit);
    expect(edit.showModal.mock.calls[0][0].toJSON().components[0].components[0].value).toBe(
      'New Master',
    );
    const remove = interaction('remove', entry.id);
    await call(remove);
    expect(JSON.stringify(remove.update.mock.calls[0][0])).toContain('Confirm Removal');
    expect(roster.snapshot(guild, 'ra3').entries).toHaveLength(2);
    await call(interaction('confirm', entry.id));
    expect(roster.snapshot(guild, 'ra3').entries).toHaveLength(1);
  });
  it('paginates long rosters within Discord limits and keeps normal-user pages read-only', async () => {
    for (let index = 0; index < 25; index++)
      roster.change(guild, 'ra3', roster.snapshot(guild, 'ra3').revision, 0, {
        name: `${index}` + '*'.repeat(45),
        year: 2024,
        patch: '*'.repeat(50),
      });
    const view = mastersView(guild, user, 'ra3', false);
    expect(view.embeds[0].length).toBeLessThanOrEqual(6000);
    expect(JSON.stringify(view.components)).not.toContain('Add Expert');
    const next = interaction('page', 0, 'button', false);
    next.customId = view.components[0].toJSON().components[1].custom_id!;
    await call(next);
    expect(JSON.stringify(next.update.mock.calls[0][0])).toContain('Page 2/3');
    expect(JSON.stringify(next.update.mock.calls[0][0])).not.toContain('Edit Expert');
  });
});
