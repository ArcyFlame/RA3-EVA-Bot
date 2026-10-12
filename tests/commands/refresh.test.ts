import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/database/sqlite';
import { refreshSettings, REFRESH_TASKS } from '../../src/repositories/refresh-settings.repository';
import { RefreshSchedule, startScannerTimer } from '../../src/utils/refresh-scheduler';
import { handleRefresh, refreshView } from '../../src/commands/admin/refresh-admin.view';
import { execute } from '../../src/commands/admin/refresh-admin.command';
import type { ButtonInteraction, ChatInputCommandInteraction } from 'discord.js';
import type { RA3Bot } from '../../src/bot';

const permissions = vi.hoisted(() => ({ owner: false }));
vi.mock('../../src/utils/permissions', () => ({
  isOwner: () => permissions.owner,
  denyUnlessAdmin: (member: { admin: boolean } | null) => (member?.admin ? null : 'Admin only.'),
}));
const guild = '111111111111111111',
  other = '222222222222222222',
  user = '333333333333333333';
beforeEach(() => {
  permissions.owner = false;
  db.exec(
    'CREATE TABLE IF NOT EXISTS app_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT); DELETE FROM app_settings;',
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function interaction(action = 'edit', task = 'lobby', kind = 'button', admin = true, value = '10') {
  return {
    customId: `refresh:${action}:${guild}:${user}:${task}:0`,
    guildId: guild,
    user: { id: user },
    guild: { members: { fetch: vi.fn().mockResolvedValue({ admin }) } },
    isButton: () => kind === 'button',
    isModalSubmit: () => kind === 'modal',
    isStringSelectMenu: () => kind === 'select',
    values: [task],
    fields: { getTextInputValue: () => value },
    reply: vi.fn(),
    followUp: vi.fn(),
    update: vi.fn(),
    showModal: vi.fn(),
  };
}
const call = (i: ReturnType<typeof interaction>) =>
  handleRefresh(i as unknown as ButtonInteraction);

describe('refresh settings and permissions', () => {
  it('keeps defaults and server settings isolated and resets one setting only', () => {
    expect(refreshSettings.minutes(guild, 'lobby')).toBe(3);
    refreshSettings.set(guild, 'lobby', 0, 6);
    expect(refreshSettings.minutes(other, 'lobby')).toBe(3);
    refreshSettings.set(guild, 'stats', 1, 30);
    refreshSettings.set(guild, 'lobby', 2, null);
    expect(refreshSettings.minutes(guild, 'lobby')).toBe(3);
    expect(refreshSettings.minutes(guild, 'stats')).toBe(30);
    expect(() => refreshSettings.set(guild, 'lobby', 0, 5)).toThrow('outdated');
  });
  it.each([0, -1, 0.1, 1441, NaN])('rejects invalid minutes %s', (minutes) => {
    expect(() => refreshSettings.set(guild, 'lobby', 0, minutes)).toThrow();
    expect(refreshSettings.minutes(guild, 'lobby')).toBe(3);
  });
  it('opens privately for admins and never presents global options to non-owners', async () => {
    const i = interaction();
    await execute({} as RA3Bot, i as unknown as ChatInputCommandInteraction);
    expect(i.reply.mock.calls[0][0].ephemeral).toBe(true);
    const normal = JSON.stringify(refreshView(guild, user, false));
    expect(normal).toContain('Lobby panel');
    expect(normal).not.toContain('Twitch scanner');
    expect(JSON.stringify(refreshView(guild, user, true))).toContain('Twitch scanner');
  });
  it.each(['select', 'edit', 'save', 'reset'])(
    'requires fresh admin privileges on %s',
    async (action) => {
      const i = interaction(
        action,
        'lobby',
        action === 'save' ? 'modal' : action === 'select' ? 'select' : 'button',
        false,
      );
      await call(i);
      expect(i.guild.members.fetch).toHaveBeenCalledWith({ user, force: true });
      expect(i.reply.mock.calls[0][0].content).toContain('Admin only');
      expect(i.showModal).not.toHaveBeenCalled();
      expect(i.update).not.toHaveBeenCalled();
    },
  );
  it.each(['select', 'edit', 'save', 'reset'])(
    'blocks forged global %s for server admins',
    async (action) => {
      const i = interaction(
        action,
        'twitch',
        action === 'save' ? 'modal' : action === 'select' ? 'select' : 'button',
      );
      await call(i);
      expect(i.reply.mock.calls[0][0].content).toContain('Only the bot owner');
      expect(refreshSettings.minutes(null, 'twitch')).toBe(5);
    },
  );
  it('lets only the owner save shared intervals and validates the form', async () => {
    permissions.owner = true;
    const edit = interaction('edit', 'twitch');
    await call(edit);
    expect(edit.showModal.mock.calls[0][0].toJSON().custom_id.length).toBeLessThanOrEqual(100);
    const save = interaction('save', 'twitch', 'modal', true, '8');
    await call(save);
    expect(refreshSettings.minutes(other, 'twitch')).toBe(8);
    expect(save.reply.mock.calls[0][0].ephemeral).toBe(true);
    const invalid = interaction('save', 'lobby', 'modal', true, '1e2');
    await call(invalid);
    expect(refreshSettings.minutes(guild, 'lobby')).toBe(3);
  });
  it.each(['user', 'guild'])('rejects wrong %s menu bindings', async (binding) => {
    const i = interaction();
    if (binding === 'user') i.user.id = other;
    else i.guildId = other;
    await call(i);
    expect(i.showModal).not.toHaveBeenCalled();
  });
});

describe('dynamic scheduling', () => {
  it('runs panels independently and picks up interval changes without restarting', async () => {
    vi.useFakeTimers();
    const schedule = new RefreshSchedule(),
      run = vi.fn().mockResolvedValue(undefined);
    expect(await schedule.run(guild, 'lobby', run)).toBe(true);
    expect(await schedule.run(guild, 'lobby', run)).toBe(false);
    expect(await schedule.run(other, 'lobby', run)).toBe(true);
    await vi.advanceTimersByTimeAsync(60000);
    refreshSettings.set(guild, 'lobby', 0, 1);
    expect(await schedule.run(guild, 'lobby', run)).toBe(true);
    expect(await schedule.run(other, 'lobby', run)).toBe(false);
  });
  it('prevents overlapping panel jobs and releases the lock after failure', async () => {
    vi.useFakeTimers();
    const schedule = new RefreshSchedule();
    let release!: () => void;
    const pending = schedule.run(
      guild,
      'lobby',
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await vi.advanceTimersByTimeAsync(180000);
    expect(await schedule.run(guild, 'lobby', vi.fn())).toBe(false);
    release();
    await pending;
    await expect(
      schedule.run(guild, 'lobby', () => Promise.reject(new Error('offline'))),
    ).rejects.toThrow('offline');
    await vi.advanceTimersByTimeAsync(180000);
    expect(await schedule.run(guild, 'lobby', async () => {})).toBe(true);
  });
  for (const task of ['news', 'tournaments', 'forum', 'twitch', 'youtube', 'moddb'] as const) {
    it(`applies ${task} shared timer settings dynamically`, async () => {
      vi.useFakeTimers();
      const run = vi.fn().mockResolvedValue(undefined);
      const timer = startScannerTimer(task, run);
      refreshSettings.set(guild, task, 0, REFRESH_TASKS[task].min);
      await vi.advanceTimersByTimeAsync(REFRESH_TASKS[task].min * 60000 - 1);
      expect(run).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(run).toHaveBeenCalledTimes(1);
      clearInterval(timer);
    });
  }
});
