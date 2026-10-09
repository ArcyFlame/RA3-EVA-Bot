import { describe, expect, it, vi } from 'vitest';
import { ApplicationCommandType, REST, Routes } from 'discord.js';
import { syncCommandDefinitions } from '../../src/utils/command-registration';

describe('slash command synchronization', () => {
  const definition = { name: 'help' };
  function rest() {
    return {
      get: vi.fn().mockResolvedValue([
        { id: 'duplicate', name: 'help', type: 1 },
        { id: 'unrelated', name: 'special', type: 1 },
        { id: 'context', name: 'help', type: 2 },
      ]),
      put: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(undefined),
    };
  }
  it('updates globals first and deletes only same-name/type commands owned by the app', async () => {
    const api = rest();
    const result = await syncCommandDefinitions(
      api as unknown as REST,
      'app',
      [definition],
      ['guild', 'guild'],
    );
    expect(result).toMatchObject({ removed: 1, scope: 'global', failedGuilds: [] });
    expect(api.put).toHaveBeenCalledWith(Routes.applicationCommands('app'), { body: [definition] });
    expect(api.delete).toHaveBeenCalledExactlyOnceWith(
      Routes.applicationGuildCommand('app', 'guild', 'duplicate'),
    );
    expect(api.put.mock.invocationCallOrder[0]).toBeLessThan(
      api.delete.mock.invocationCallOrder[0],
    );
  });
  it('does not remove anything if global registration fails', async () => {
    const api = rest();
    api.put.mockRejectedValue(new Error('offline'));
    await expect(
      syncCommandDefinitions(api as unknown as REST, 'app', [definition], ['guild']),
    ).rejects.toThrow('offline');
    expect(api.delete).not.toHaveBeenCalled();
  });
  it('removes obsolete underscore guild registrations after publishing the new command tree', async () => {
    const api = rest();
    api.get.mockResolvedValue([
      { id: 'old', name: 'bot_setup', type: 1 },
      { id: 'other', name: 'special', type: 1 },
      { id: 'context', name: 'bot_setup', type: 2 },
    ]);
    const result = await syncCommandDefinitions(
      api as unknown as REST,
      'app',
      [{ name: 'bot' }],
      ['guild'],
    );
    expect(result.removed).toBe(1);
    expect(api.delete).toHaveBeenCalledExactlyOnceWith(
      Routes.applicationGuildCommand('app', 'guild', 'old'),
    );
  });
  it('preserves global commands in explicit development mode', async () => {
    const api = rest();
    expect(
      (await syncCommandDefinitions(api as unknown as REST, 'app', [definition], ['guild'], 'dev'))
        .scope,
    ).toBe('guild');
    expect(api.put).toHaveBeenCalledWith(Routes.applicationGuildCommands('app', 'dev'), {
      body: [definition],
    });
    expect(api.delete).not.toHaveBeenCalled();
    expect(api.get).not.toHaveBeenCalled();
  });
  it('retains cleanup failures without silently declaring success', async () => {
    const api = rest();
    api.get.mockRejectedValue(new Error('forbidden'));
    expect(
      (
        await syncCommandDefinitions(
          api as unknown as REST,
          'app',
          [{ name: 'help', type: ApplicationCommandType.ChatInput }],
          ['guild'],
        )
      ).failedGuilds,
    ).toEqual(['guild']);
  });
});
