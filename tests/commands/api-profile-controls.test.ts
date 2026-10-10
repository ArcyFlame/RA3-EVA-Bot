import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Collection } from 'discord.js';
import { connectDatabase } from '../../src/database/connection';
import { guildRepository } from '../../src/repositories/guild.repository';
import { openApi, handleApi, apiView } from '../../src/commands/admin/api.view';
import { handleBotProfile, openBotProfile } from '../../src/commands/setup/bot-profile.view';
import { serviceCredentials } from '../../src/services/service-credentials.service';
import { botProfileService } from '../../src/services/bot-profile.service';
const owner = '123456789012345678',
  admin = '222222222222222222';
beforeAll(connectDatabase);
beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(serviceCredentials, 'status').mockReturnValue('missing');
  vi.spyOn(serviceCredentials, 'check').mockResolvedValue('active');
  vi.spyOn(serviceCredentials, 'checkAll').mockResolvedValue(undefined);
  vi.spyOn(serviceCredentials, 'save').mockImplementation(() => undefined);
  vi.spyOn(botProfileService, 'update').mockResolvedValue(undefined);
});
function fixture(id = admin, privileged = true) {
  const guildId = 'test-api-profile';
  guildRepository.upsert(guildId, { game: 'ra3' });
  const member = {
    id,
    guild: { id: guildId, ownerId: 'other' },
    permissions: { has: () => privileged },
    roles: { cache: new Collection() },
  };
  const guild: any = {
    id: guildId,
    members: {
      fetch: vi.fn().mockResolvedValue(member),
      me: { displayName: 'EVA', displayAvatarURL: () => null },
    },
  };
  const i: any = {
    user: { id },
    guild,
    guildId,
    reply: vi.fn(),
    update: vi.fn(),
    editReply: vi.fn(),
    deferReply: vi.fn(),
    showModal: vi.fn(),
    isButton: () => true,
    isModalSubmit: () => false,
    isStringSelectMenu: () => false,
    fields: { getTextInputValue: vi.fn().mockReturnValue('private-service-key-12345') },
  };
  const bot: any = { refreshServiceConfiguration: vi.fn().mockResolvedValue(undefined) };
  return { i, bot, member, guild };
}
describe('private API and profile controls', () => {
  it('lets admins view status privately but disables all key edits for nonowners', async () => {
    const f = fixture();
    await openApi(f.i);
    expect(f.i.reply.mock.calls[0][0].ephemeral).toBe(true);
    const buttons = apiView(admin).components[1].toJSON().components as any[];
    expect(buttons.filter((b) => b.disabled).length).toBe(3);
    f.i.customId = `service_api:check:challonge:${admin}`;
    await handleApi(f.bot, f.i);
    expect(serviceCredentials.checkAll).toHaveBeenCalledOnce();
    expect(f.i.deferReply).toHaveBeenCalledWith({ ephemeral: true });
  });
  it.each(['edit', 'disable', 'environment', 'save'])(
    'rejects nonowner forged credential action %s',
    async (action) => {
      const f = fixture();
      f.i.customId = `service_api:${action}:challonge:${admin}`;
      f.i.isModalSubmit = () => action === 'save';
      await handleApi(f.bot, f.i);
      expect(f.i.reply.mock.calls[0][0].content).toContain('Only the bot owner');
      expect(serviceCredentials.save).not.toHaveBeenCalled();
      expect(f.i.showModal).not.toHaveBeenCalled();
    },
  );
  it('allows the owner to save keys privately, refresh services, and never echo the value', async () => {
    const f = fixture(owner);
    f.i.customId = `service_api:save:youtube:${owner}`;
    f.i.isModalSubmit = () => true;
    f.i.isButton = () => false;
    await handleApi(f.bot, f.i);
    expect(serviceCredentials.save).toHaveBeenCalledWith('youtube', {
      YOUTUBE_API_KEY: 'private-service-key-12345',
    });
    expect(f.bot.refreshServiceConfiguration).toHaveBeenCalledOnce();
    expect(JSON.stringify(f.i.editReply.mock.calls)).not.toContain('private-service-key-12345');
    expect(f.i.deferReply).toHaveBeenCalledWith({ ephemeral: true });
  });
  it('blocks stolen menu IDs, prototype service names, and revoked admin roles', async () => {
    const f = fixture();
    f.i.customId = `service_api:disable:youtube:${owner}`;
    await handleApi(f.bot, f.i);
    f.i.customId = `service_api:edit:constructor:${admin}`;
    await handleApi(f.bot, f.i);
    expect(f.i.reply.mock.calls[1][0].content).toContain('valid service');
    f.member.permissions.has = () => false;
    f.i.customId = `service_api:check:youtube:${admin}`;
    await handleApi(f.bot, f.i);
    expect(serviceCredentials.save).not.toHaveBeenCalled();
    expect(serviceCredentials.checkAll).not.toHaveBeenCalled();
  });
  it('keeps profile menus private, uses native upload fields, and rechecks admins on submission', async () => {
    const f = fixture();
    await openBotProfile(f.i);
    expect(f.i.reply.mock.calls[0][0].ephemeral).toBe(true);
    f.i.customId = `bot_profile:avatar:${admin}`;
    await handleBotProfile(f.i);
    const modal = f.i.showModal.mock.calls[0][0].toJSON();
    expect(modal.components[1].component.type).toBe(19);
    f.member.permissions.has = () => false;
    f.i.customId = `bot_profile:save_nickname:${admin}`;
    f.i.isModalSubmit = () => true;
    f.i.isButton = () => false;
    await handleBotProfile(f.i);
    expect(botProfileService.update).not.toHaveBeenCalled();
  });
  it('does not expose either admin menu to ordinary members or DMs', async () => {
    const f = fixture(admin, false);
    await openApi(f.i);
    await openBotProfile(f.i);
    expect(f.i.reply.mock.calls.every(([p]: any[]) => p.ephemeral && !p.components)).toBe(true);
    f.i.guild = null;
    await openApi(f.i);
    expect(f.i.reply.mock.calls.at(-1)![0].content).toContain('inside a server');
  });
});
