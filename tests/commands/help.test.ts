import { describe, expect, it, vi } from 'vitest';
import { HelpView } from '../../src/commands/info/help.view';
import { buildAdminEmbed, buildCommunityEmbed } from '../../src/commands/info/help.embeds';
import type { StringSelectMenuInteraction } from 'discord.js';

vi.mock('../../src/utils/permissions', () => ({
  isModerator: (member: { staff: boolean }) => member.staff,
}));
function interaction(staff = true) {
  return {
    user: { id: '333333333333333333' },
    guild: { members: { fetch: vi.fn().mockResolvedValue({ staff }) } },
    reply: vi.fn(),
    update: vi.fn(),
  };
}

describe('staff-only help', () => {
  it.each(['ra3', 'genevo'] as const)('documents the correct tips controls for %s', (game) => {
    const admin = buildAdminEmbed(game).toJSON();
    const tips = admin.fields?.find((field) => field.name.includes('Gameplay Tips'));
    expect(tips?.value).toContain('/bot tips');
    expect(tips?.value).toContain('Public');
    expect(tips?.value).toContain('Private');
    expect(tips?.value).toContain('Disable Tips');
    expect(tips?.value).toContain('footer');
    expect(tips?.value).toContain('faction/subfaction');
    expect(JSON.stringify(admin)).toContain('/tournament participant');
    expect(JSON.stringify(admin)).toContain('/activity xp');
    expect(JSON.stringify(admin)).toContain('/bot refresh');
    expect(JSON.stringify(admin)).toContain('/bot update');
    const community = JSON.stringify(buildCommunityEmbed(game).toJSON());
    expect(community).toContain('`/tips`');
    expect(community).not.toContain('/tips [visibility]');
    expect(community).not.toContain('/bot tips');
    expect(community).toContain('Public by default');
  });
  it('hides staff categories in both the main embed and dropdown for ordinary members', () => {
    const view = new HelpView(false);
    const options = view.getComponents()[0].toJSON().components[0];
    expect(JSON.stringify(options)).not.toContain('Admin Tools');
    expect(JSON.stringify(options)).not.toContain('Moderation');
    expect(JSON.stringify(view.getEmbed().toJSON())).not.toContain('Admin Tools');
    expect(JSON.stringify(view.getEmbed().toJSON())).not.toContain('Moderation');
  });
  it.each(['admin', 'moderation'])(
    'blocks a forged %s selection by a non-staff viewer',
    async (category) => {
      const i = interaction();
      await new HelpView(false).handleSelect(i as unknown as StringSelectMenuInteraction, category);
      expect(i.update).not.toHaveBeenCalled();
      expect(i.reply.mock.calls[0][0].ephemeral).toBe(true);
    },
  );
  it.each(['admin', 'moderation'])('rechecks staff privileges for the %s tab', async (category) => {
    const i = interaction(false);
    const view = new HelpView(true);
    await view.handleSelect(i as unknown as StringSelectMenuInteraction, category);
    expect(i.guild.members.fetch).toHaveBeenCalledWith({ user: i.user.id, force: true });
    expect(i.update).not.toHaveBeenCalled();
    i.guild.members.fetch.mockResolvedValue({ staff: true });
    await new HelpView(true).handleSelect(i as unknown as StringSelectMenuInteraction, category);
    expect(i.update).toHaveBeenCalled();
  });
  it('fails closed if the staff lookup fails', async () => {
    const i = interaction();
    i.guild.members.fetch.mockRejectedValue(new Error('unavailable'));
    await new HelpView(true).handleSelect(i as unknown as StringSelectMenuInteraction, 'admin');
    expect(i.update).not.toHaveBeenCalled();
  });
  it.each(['ra3', 'genevo'] as const)(
    'keeps staff commands out of every public %s category',
    async (game) => {
      const view = new HelpView(false, undefined, [], game);
      for (const category of ['main', 'tournaments', 'community', 'profile', 'info']) {
        const i = interaction(false);
        await view.handleSelect(i as unknown as StringSelectMenuInteraction, category);
        const text = JSON.stringify(i.update.mock.calls[0][0]);
        for (const command of [
          '/admin',
          '/master add',
          '/master remove',
          '/bot setup',
          '/bot tips',
          '/bot refresh',
          '/bot update',
          '/toggle',
          '/checkin',
          '/tournament link',
          '/activity xp',
          '/kick',
          '/ban',
          '/purge',
          '/warn',
          '/api',
          '/restart',
          '/kill',
        ])
          expect(text).not.toContain(command);
        expect(text).not.toContain('Off by default');
      }
    },
  );
  it('removes staff commands and tabs when permissions are revoked while browsing main', async () => {
    const view = new HelpView(true);
    const i = interaction(false);
    await view.handleSelect(i as unknown as StringSelectMenuInteraction, 'main');
    expect(JSON.stringify(i.update.mock.calls[0][0])).not.toContain('Admin Tools');
    expect(JSON.stringify(i.update.mock.calls[0][0])).not.toContain('Moderation');
  });
});
