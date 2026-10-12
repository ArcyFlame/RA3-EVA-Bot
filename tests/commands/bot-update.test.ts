import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ButtonInteraction, ChatInputCommandInteraction } from 'discord.js';
import type { RA3Bot } from '../../src/bot';
import { execute } from '../../src/commands/admin/bot-update.command';
import { handleBotUpdate } from '../../src/commands/admin/bot-update.view';
import { requestBotUpdate } from '../../src/services/bot-update.service';

vi.mock('../../src/services/bot-update.service', () => ({ requestBotUpdate: vi.fn() }));
vi.mock('../../src/utils/logger', () => ({ audit: vi.fn() }));
const owner = '123456789012345678',
  guild = '222222222222222222',
  token = 'a'.repeat(32);
function interaction() {
  return {
    user: { id: owner },
    guildId: guild,
    customId: `botupdate:yes:${guild}:${owner}:${token}`,
    reply: vi.fn(),
    deferReply: vi.fn(),
    editReply: vi.fn(),
    deferUpdate: vi.fn(),
  };
}
const request = vi.mocked(requestBotUpdate);
beforeEach(() => {
  vi.clearAllMocks();
});
describe('/bot update', () => {
  it('shows private Yes/No controls after a check without requesting installation', async () => {
    request.mockResolvedValue({
      status: 'available',
      installed: '5.4.0',
      version: '5.5.0',
      tag: 'v5.5.0',
      token,
    });
    const i = interaction();
    await execute({} as RA3Bot, i as unknown as ChatInputCommandInteraction);
    expect(i.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(request).toHaveBeenCalledExactlyOnceWith('check');
    expect(JSON.stringify(i.editReply.mock.calls[0][0])).toContain('Yes, update now');
    expect(JSON.stringify(i.editReply.mock.calls[0][0])).toContain('No');
  });
  it.each(['command', 'button'])('blocks non-owner %s access', async (kind) => {
    const i = interaction();
    i.user.id = '333333333333333333';
    if (kind === 'command')
      await execute({} as RA3Bot, i as unknown as ChatInputCommandInteraction);
    else await handleBotUpdate(i as unknown as ButtonInteraction);
    expect(request).not.toHaveBeenCalled();
    expect(i.reply.mock.calls[0][0].ephemeral).toBe(true);
  });
  it.each(['guild', 'user', 'malformed'])(
    'rejects a button with invalid %s binding',
    async (kind) => {
      const i = interaction();
      if (kind === 'guild') i.guildId = '333333333333333333';
      if (kind === 'user') i.customId = i.customId.replace(owner, '333333333333333333');
      if (kind === 'malformed') i.customId = 'botupdate:yes:bad';
      await handleBotUpdate(i as unknown as ButtonInteraction);
      expect(request).not.toHaveBeenCalled();
    },
  );
  it.each(['yes', 'no'])(
    'handles %s through the host and removes confirmation buttons',
    async (choice) => {
      request.mockResolvedValue({
        status: choice === 'yes' ? 'accepted' : 'cancelled',
        version: '5.5.0',
      });
      const i = interaction();
      i.customId = i.customId.replace(':yes:', `:${choice}:`);
      await handleBotUpdate(i as unknown as ButtonInteraction);
      expect(request).toHaveBeenCalledExactlyOnceWith(
        choice === 'yes' ? 'confirm' : 'cancel',
        token,
      );
      expect(i.editReply.mock.calls[0][0].components).toEqual([]);
    },
  );
  it.each(['current', 'busy', 'failed', 'unmanaged'] as const)(
    'does not offer installation when %s',
    async (status) => {
      request.mockResolvedValue({ status, installed: '5.4.0' });
      const i = interaction();
      await execute({} as RA3Bot, i as unknown as ChatInputCommandInteraction);
      expect(i.editReply.mock.calls[0][0].components).toEqual([]);
    },
  );
});
