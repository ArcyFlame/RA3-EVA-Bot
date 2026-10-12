import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/database/sqlite';
import { CURATED_TIPS, TIP_FACTIONS } from '../../src/content/tips';
import { TipRepository, tipRepository } from '../../src/repositories/tip.repository';
import { handleTipManager, tipManagerView } from '../../src/commands/admin/tips-admin.view';
import { execute as openManager } from '../../src/commands/admin/tips-admin.command';
import { execute as showTip } from '../../src/commands/info/tips.command';
import { tipSettingsRepository } from '../../src/repositories/tip-settings.repository';
import type { ButtonInteraction, ChatInputCommandInteraction } from 'discord.js';
import type { RA3Bot } from '../../src/bot';
import { ComponentType, ModalSubmitFields } from 'discord.js';
import { formatTipDetails } from '../../src/commands/admin/tips-admin.form';

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
    fields: Reflect.construct(ModalSubmitFields, [
      Object.entries(fields).map(([customId, value], index) => ({
        id: index,
        type: ComponentType.ActionRow,
        components: [{ id: index, type: ComponentType.TextInput, customId, value }],
      })),
    ]) as ModalSubmitFields,
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
describe('two-step tip editing', () => {
  const basics = {
    title: 'Economy',
    faction: 'General',
    text: 'Protect your economy.',
    footer: 'Custom footer',
  };
  const blankSources = { quote: '', speaker: '', quote_source: '', tip_source: '' };
  async function start(id = 0) {
    const i = interaction('draft', id, 0, 'modal', basics);
    await call(i);
    const response = i.reply.mock.calls[0][0];
    expect(response.ephemeral).toBe(true);
    expect(response.content).toContain('Nothing has been saved');
    const buttons = response.components[0].toJSON().components;
    return { continueId: buttons[0].custom_id as string, cancelId: buttons[1].custom_id as string };
  }
  it.each(['ra3', 'genevo'] as const)(
    'saves %s only after both steps and prevents resubmission',
    async (game) => {
      context.game = game;
      const { continueId } = await start();
      expect(tipRepository.revision(guild, game)).toBe(0);
      const next = interaction('details', 0);
      next.customId = continueId;
      await call(next);
      const modal = next.showModal.mock.calls[0][0].toJSON();
      expect(modal.components).toHaveLength(4);
      expect(modal.custom_id.length).toBeLessThanOrEqual(100);
      const finish = interaction('finish', 0, 0, 'modal', {
        quote: 'A real quoted line',
        speaker: 'Unit',
        quote_source: 'https://example.com/quote',
        tip_source: '',
      });
      finish.customId = modal.custom_id;
      await call(finish);
      const saved = tipRepository.list(guild, game).find((entry) => entry.id === 1000)!;
      expect(saved).toMatchObject({
        title: basics.title,
        footer: basics.footer,
        source: '',
        quote: { text: 'A real quoted line', speaker: 'Unit' },
      });
      expect(finish.reply.mock.calls[0][0].ephemeral).toBe(true);
      await call(finish);
      expect(tipRepository.revision(guild, game)).toBe(1);
    },
  );
  it('prefills existing sources and removes a quote when its three fields are cleared', async () => {
    const { continueId } = await start(1);
    const next = interaction('details');
    next.customId = continueId;
    await call(next);
    const modal = next.showModal.mock.calls[0][0].toJSON();
    const fields = modal.components.flatMap((row: any) => row.components);
    expect(fields.map((field: any) => field.value)).toEqual([
      CURATED_TIPS.ra3[0].quote?.text,
      CURATED_TIPS.ra3[0].quote?.speaker,
      CURATED_TIPS.ra3[0].quote?.source,
      CURATED_TIPS.ra3[0].source,
    ]);
    const finish = interaction('finish', 1, 0, 'modal', blankSources);
    finish.customId = modal.custom_id;
    await call(finish);
    expect(tipRepository.list(guild, 'ra3')[0]).toMatchObject({ title: basics.title, source: '' });
    expect(tipRepository.list(guild, 'ra3')[0].quote).toBeUndefined();
  });
  it('cancels a draft without changing the database', async () => {
    const { cancelId, continueId } = await start();
    const cancel = interaction('cancel', 0);
    cancel.customId = cancelId;
    await call(cancel);
    expect(cancel.update.mock.calls[0][0].content).toContain('No changes were saved');
    const next = interaction('details', 0);
    next.customId = continueId;
    await call(next);
    expect(next.showModal).not.toHaveBeenCalled();
    expect(next.reply.mock.calls[0][0].content).toContain('expired or is unavailable');
    expect(tipRepository.revision(guild, 'ra3')).toBe(0);
  });
  it.each([
    { ...blankSources, quote: 'x'.repeat(181) },
    { ...blankSources, quote_source: 'javascript:alert(1)' },
    { ...blankSources, tip_source: 'javascript:alert(1)' },
  ])('rejects invalid step 2 and leaves the draft available for retry', async (fields) => {
    const { continueId } = await start();
    const finish = interaction('finish', 0, 0, 'modal', fields);
    finish.customId = continueId.replace(':details:', ':finish:');
    await call(finish);
    expect(finish.reply.mock.calls[0][0].content).toContain('Tip not saved');
    expect(tipRepository.revision(guild, 'ra3')).toBe(0);
    const retry = interaction('finish', 0, 0, 'modal', blankSources);
    retry.customId = finish.customId;
    await call(retry);
    expect(tipRepository.revision(guild, 'ra3')).toBe(1);
  });
  it('rejects stale drafts after another edit', async () => {
    const { continueId } = await start();
    tipRepository.change(guild, 'ra3', 0, 'save', 1, CURATED_TIPS.ra3[0]);
    const finish = interaction('finish', 0, 0, 'modal', blankSources);
    finish.customId = continueId.replace(':details:', ':finish:');
    await call(finish);
    expect(finish.reply.mock.calls[0][0].content).toContain('outdated');
    expect(tipRepository.revision(guild, 'ra3')).toBe(1);
  });
  for (const game of ['ra3', 'genevo'] as const) {
    it.each(Array.from({ length: 16 }, (_, index) => index))(
      `saves and restores independently optional ${game} fields (combination %s)`,
      async (mask) => {
        context.game = game;
        const fields = {
          quote: mask & 1 ? 'Quoted line' : '',
          speaker: mask & 2 ? 'Unit' : '',
          quote_source: mask & 4 ? 'https://example.com/quote' : '',
          tip_source: mask & 8 ? 'https://example.com/tip' : '',
        };
        const { continueId } = await start();
        const finish = interaction('finish', 0, 0, 'modal', fields);
        finish.customId = continueId.replace(':details:', ':finish:');
        await call(finish);
        expect(tipRepository.revision(guild, game)).toBe(1);
        const saved = new TipRepository(db).list(guild, game).find((tip) => tip.id === 1000)!;
        expect(saved.source).toBe(fields.tip_source);
        if (mask & 7)
          expect(saved.quote).toMatchObject({
            text: fields.quote,
            speaker: fields.speaker,
            source: fields.quote_source,
          });
        else expect(saved.quote).toBeUndefined();
        const edit = interaction('edit', 1000, 1);
        await call(edit);
        expect(edit.showModal).toHaveBeenCalled();
      },
    );
  }
});

describe('staff tip interactions', () => {
  it.each(['ra3', 'genevo'] as const)(
    'lists every available %s faction in the admin menu',
    (game) => {
      const view = tipManagerView(guild, user, game);
      const fields = view.embeds[0].toJSON().fields ?? [];
      const guidance = fields.find(
        (field) => field.name === 'Available factions for Add Tip / Edit Tip',
      );
      expect(guidance).toBeDefined();
      expect(guidance!.value.split('\n')).toEqual(
        Object.values(TIP_FACTIONS[game]).map((label) => `\`${label}\``),
      );
      expect(guidance!.value.length).toBeLessThanOrEqual(1024);
    },
  );
  it('opens privately, and normal /tips exposes only source links', async () => {
    const i = interaction('browse');
    await openManager({} as RA3Bot, i as unknown as ChatInputCommandInteraction);
    expect(i.reply.mock.calls[0][0].ephemeral).toBe(true);
    const publicI = interaction('browse');
    await showTip({} as RA3Bot, publicI as unknown as ChatInputCommandInteraction);
    expect(publicI.reply.mock.calls[0][0].ephemeral).toBe(false);
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
    'visibility',
    'enable',
    'disable',
    'public',
    'private',
    'saveform',
    'draft',
    'details',
    'finish',
    'cancel',
    'find',
    'search',
  ])('rechecks live staff privileges for %s', async (action) => {
    const i = interaction(action);
    i.guild.members.fetch.mockResolvedValue({ staff: false });
    await call(i);
    expect(i.guild.members.fetch).toHaveBeenCalledWith({ user, force: true });
    expect(i.reply.mock.calls[0][0].ephemeral).toBe(true);
    expect(i.update).not.toHaveBeenCalled();
    expect(i.showModal).not.toHaveBeenCalled();
    expect(tipRepository.revision(guild, 'ra3')).toBe(0);
    expect(tipSettingsRepository.get(guild)).toEqual({ enabled: true, visibility: 'public' });
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
    expect(modal.components).toHaveLength(action === 'quote' ? 3 : 4);
    if (action !== 'quote') {
      const inputs = modal.components.flatMap((row: any) => row.components);
      expect(inputs.map((input: any) => input.custom_id)).toEqual([
        'title',
        'faction',
        'text',
        'footer',
      ]);
      expect(inputs.find((input: any) => input.custom_id === 'footer').required).toBe(false);
      expect(modal.custom_id).toContain(':draft:');
    }
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
  it.each(['ra3', 'genevo'] as const)(
    'adds and edits a %s tip with no source or footer',
    async (game) => {
      context.game = game;
      const add = interaction('save', 0, 0, 'modal', {
        title: 'Economy',
        text: 'Protect your economy.',
        footer: '',
        source: '',
      });
      await call(add);
      const saved = tipRepository.list(guild, game).find((tip) => tip.id === 1000)!;
      expect(saved).toMatchObject({ title: 'Economy', source: '', origin: 'server' });
      expect(saved.footer).toBeUndefined();
      expect(add.reply.mock.calls[0][0].embeds).toHaveLength(1);
      expect(add.reply.mock.calls[0][0].ephemeral).toBe(true);
      for (const row of add.reply.mock.calls[0][0].components)
        expect(row.toJSON().components.length).toBeGreaterThan(0);
      const edit = interaction('save', 1000, 1, 'modal', {
        title: 'Updated economy',
        text: 'Protect your economy.',
        footer: 'Community tactics',
        source: '',
      });
      await call(edit);
      expect(tipRepository.list(guild, game).find((tip) => tip.id === 1000)?.footer).toBe(
        'Community tactics',
      );
      expect(edit.reply.mock.calls[0][0].embeds[0].data.footer.text).toBe('Community tactics');
      const show = interaction('edit', 1000, 2);
      await call(show);
      const inputs = show.showModal.mock.calls[0][0]
        .toJSON()
        .components.flatMap((row: any) => row.components);
      expect(inputs.find((input: any) => input.custom_id === 'footer').value).toBe(
        'Community tactics',
      );
    },
  );
  it('accepts an older open form without a footer field and preserves its existing footer', async () => {
    const tip = { ...CURATED_TIPS.ra3[0], footer: 'Keep this footer' };
    tipRepository.change(guild, 'ra3', 0, 'save', 1, tip);
    const i = interaction('save', 1, 1, 'modal', {
      title: tip.title,
      text: tip.text,
      source: tip.source,
    });
    await call(i);
    expect(tipRepository.list(guild, 'ra3')[0].footer).toBe(tip.footer);
    expect(i.reply.mock.calls[0][0].embeds).toHaveLength(1);
  });
  it('explains an invalid optional source and leaves the database unchanged', async () => {
    const i = interaction('save', 0, 0, 'modal', {
      title: 'Economy',
      text: 'Protect your economy.',
      source: 'not a link',
      footer: '',
    });
    await call(i);
    expect(i.reply.mock.calls[0][0].content).toContain('HTTPS');
    expect(tipRepository.revision(guild, 'ra3')).toBe(0);
  });
  it('reports a saved tip accurately if refreshing the menu fails', async () => {
    const i = interaction('save', 0, 0, 'modal', {
      title: 'Economy',
      text: 'Protect your economy.',
      source: '',
      footer: '',
    });
    i.reply.mockRejectedValueOnce(new Error('Delivery failed'));
    await call(i);
    expect(tipRepository.revision(guild, 'ra3')).toBe(1);
    expect(i.reply.mock.calls[1][0].content).toContain('Tip saved');
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
  it.each(['ra3', 'genevo'] as const)(
    'edits and resets a %s footer without dropping the quote',
    async (game) => {
      context.game = game;
      const original = CURATED_TIPS[game][0];
      const fields = {
        title: original.title,
        text: original.text,
        source: original.source,
        footer: 'Faction tactics - community guide',
      };
      await call(interaction('save', 1, 0, 'modal', fields));
      const saved = new TipRepository(db).list(guild, game)[0];
      expect(saved.footer).toBe(fields.footer);
      expect(saved.quote).toEqual(original.quote);
      expect(tipManagerView(guild, user, game).embeds[0].data.footer?.text).toBe(fields.footer);
      expect(tipRepository.list(otherGuild, game)[0].footer).toBeUndefined();
      const faction = interaction('faction', 1, 1, 'select');
      faction.values = [game === 'ra3' ? 'soviets' : 'usa_air'];
      await call(faction);
      expect(tipRepository.list(guild, game)[0].footer).toBe(fields.footer);
      expect(tipRepository.list(guild, game)[0].faction).toBe(faction.values[0]);
      await call(interaction('save', 1, 2, 'modal', { ...fields, footer: '' }));
      expect(tipRepository.list(guild, game)[0].footer).toBeUndefined();
      expect(tipManagerView(guild, user, game).embeds[0].data.footer?.text).toBe(
        'Server tip - supplied by staff',
      );
    },
  );
  it('rejects invalid footer edits without changing the stored tip', async () => {
    const original = CURATED_TIPS.ra3[0];
    await call(
      interaction('save', 1, 0, 'modal', {
        title: original.title,
        text: original.text,
        source: original.source,
        footer: 'x'.repeat(201),
      }),
    );
    expect(tipRepository.revision(guild, 'ra3')).toBe(0);
    expect(tipRepository.list(guild, 'ra3')[0]).toEqual(original);
  });
  it('keeps the menu compact and offers search beyond the 25-option limit', () => {
    for (let n = 0; n < 30; n++)
      tipRepository.change(guild, 'ra3', n, 'save', 0, CURATED_TIPS.ra3[0]);
    for (const selected of [1, 1029]) {
      const view = tipManagerView(guild, user, 'ra3', selected);
      expect(view.components).toHaveLength(3);
      expect(JSON.stringify(view.components)).not.toMatch(
        /Previous Page|Next Page|Edit Quote|Tip Source|Quote Source/,
      );
      expect(JSON.stringify(view.components)).toContain('Find Tip');
      for (const row of view.components) {
        expect(row.components.length).toBeLessThanOrEqual(5);
        for (const component of row.components) {
          const data = component.toJSON();
          if ('custom_id' in data) expect(data.custom_id.length).toBeLessThanOrEqual(100);
          if ('options' in data) expect(data.options.length).toBeLessThanOrEqual(25);
        }
      }
    }
  });
  it.each(['ra3', 'genevo'] as const)(
    'adds and edits %s faction and quote in the combined form',
    async (game) => {
      context.game = game;
      const original = CURATED_TIPS[game][0];
      const fields = {
        title: 'Community advice',
        faction: game === 'ra3' ? 'Soviets' : 'USA | Air Force General',
        text: 'Keep scouting.',
        footer: 'Community tips',
        details: formatTipDetails(original),
      };
      const add = interaction('saveform', 0, 0, 'modal', fields);
      await call(add);
      const saved = tipRepository.list(guild, game).find((tip) => tip.id === 1000)!;
      expect(saved.quote).toEqual(original.quote);
      expect(saved.faction).toBe(game === 'ra3' ? 'soviets' : 'usa_air');
      expect(saved.footer).toBe(fields.footer);
      expect(add.reply.mock.calls[0][0].embeds[0].data.description).toContain(
        `Tip #${CURATED_TIPS[game].length + 1}`,
      );
      expect(JSON.stringify(add.reply.mock.calls[0][0])).not.toContain('#1000');
      const edit = interaction('saveform', 1000, 1, 'modal', { ...fields, details: '' });
      await call(edit);
      expect(tipRepository.list(guild, game).find((tip) => tip.id === 1000)?.quote).toBeUndefined();
      expect(tipRepository.list(guild, game).find((tip) => tip.id === 1000)?.source).toBe('');
    },
  );
  it('changes all tip visibility with a single button without enabling disabled tips', async () => {
    tipSettingsRepository.setEnabled(guild, false);
    for (const action of ['private', 'public'] as const) {
      const i = interaction(action);
      await call(i);
      expect(tipSettingsRepository.get(guild)).toEqual({ enabled: false, visibility: action });
      const view = i.update.mock.calls[0][0];
      expect(JSON.stringify(view.components)).toContain(
        action === 'public' ? 'Make Tips Private' : 'Make Tips Public',
      );
      const dropdowns = view.components
        .flatMap((row: any) => row.toJSON().components)
        .filter((c: any) => c.type === 3);
      expect(dropdowns).toHaveLength(1);
      expect(dropdowns[0].custom_id).toContain(':select:');
    }
  });
  it('keeps displayed numbering stable when editing a custom tip and uses it in public replies', async () => {
    tipRepository.change(guild, 'ra3', 0, 'save', 0, CURATED_TIPS.ra3[0]);
    tipRepository.change(guild, 'ra3', 1, 'save', 0, CURATED_TIPS.ra3[0]);
    tipRepository.change(guild, 'ra3', 2, 'save', 1000, {
      ...CURATED_TIPS.ra3[0],
      title: 'Edited first custom',
    });
    expect(
      tipRepository
        .list(guild, 'ra3')
        .slice(-2)
        .map((tip) => tip.id),
    ).toEqual([1000, 1001]);
    expect(tipRepository.displayNumber(guild, 'ra3', 1000)).toBe(9);
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const i = interaction('browse');
    try {
      await showTip({} as RA3Bot, i as unknown as ChatInputCommandInteraction);
      expect(i.reply.mock.calls[0][0].embeds[0].data.description).toContain('Tip #10');
    } finally {
      random.mockRestore();
    }
  });
  it('finds every tip by its displayed number or title without paging buttons', async () => {
    for (let n = 0; n < 30; n++)
      tipRepository.change(guild, 'ra3', n, 'save', 0, {
        ...CURATED_TIPS.ra3[0],
        title: `Custom advice ${n}`,
      });
    for (const query of ['#38', 'Custom advice 29']) {
      const i = interaction('search', 1, 30, 'modal', { query });
      await call(i);
      expect(i.reply.mock.calls[0][0].embeds[0].data.description).toContain('Tip #38');
      expect(i.reply.mock.calls[0][0].embeds[0].data.description).toContain('Custom advice 29');
    }
    const invalid = interaction('search', 1, 30, 'modal', { query: '1000' });
    await call(invalid);
    expect(invalid.reply.mock.calls[0][0].content).toContain('No matching tip');
  });
  it('rejects an invalid combined form without partial writes', async () => {
    const i = interaction('saveform', 0, 0, 'modal', {
      title: 'Advice',
      faction: 'USA',
      text: 'Keep scouting.',
      footer: '',
      details: '',
    });
    await call(i);
    expect(i.reply.mock.calls[0][0].content).toContain('Unknown faction');
    expect(tipRepository.revision(guild, 'ra3')).toBe(0);
  });
  it.each(['ra3', 'genevo'] as const)(
    'controls visibility and enabled state in the %s staff menu',
    async (game) => {
      context.game = game;
      const initial = tipManagerView(guild, user, game);
      expect(initial.content).toContain('Public - everyone');
      const select = interaction('visibility', 1, 0, 'select');
      select.values = ['private'];
      await call(select);
      expect(tipSettingsRepository.get(guild).visibility).toBe('private');
      expect(select.update.mock.calls[0][0].content).toContain('Private - only the requester');
      await call(interaction('disable'));
      expect(tipSettingsRepository.get(guild).enabled).toBe(false);
      await call(interaction('enable'));
      expect(tipSettingsRepository.get(guild)).toEqual({ enabled: true, visibility: 'private' });
      select.values = ['public'];
      await call(select);
      expect(tipSettingsRepository.get(guild).visibility).toBe('public');
      expect(tipSettingsRepository.get(otherGuild)).toEqual({
        enabled: true,
        visibility: 'public',
      });
    },
  );
  it.each([[], ['invalid'], ['public', 'private']])(
    'rejects invalid visibility choices: %j',
    async (...values) => {
      const i = interaction('visibility', 1, 0, 'select');
      i.values = values;
      await call(i);
      expect(i.update).not.toHaveBeenCalled();
      expect(tipSettingsRepository.get(guild)).toEqual({ enabled: true, visibility: 'public' });
    },
  );
  it.each(['user', 'guild', 'game', 'revision', 'kind'])(
    'rejects visibility changes with a wrong %s',
    async (binding) => {
      const i = interaction('visibility', 1, 0, binding === 'kind' ? 'button' : 'select');
      i.values = ['private'];
      if (binding === 'user') i.user.id = '444444444444444444';
      if (binding === 'guild') i.guildId = otherGuild;
      if (binding === 'game') i.customId = i.customId.replace(':ra3:', ':genevo:');
      if (binding === 'revision') i.customId = i.customId.replace(/:0$/, ':99');
      await call(i);
      expect(i.update).not.toHaveBeenCalled();
      expect(tipSettingsRepository.get(guild).visibility).toBe('public');
    },
  );
});
