import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RA3Bot } from '../../src/bot';

const calls = vi.hoisted(() => ({
  login: vi.fn(),
  registerEvents: vi.fn(),
  registerCommands: vi.fn(),
  connect: vi.fn(),
}));
vi.mock('discord.js', async (original) => {
  const discord = await original<typeof import('discord.js')>();
  class Client {
    rest = { on: vi.fn() };
    on = vi.fn();
    login = calls.login;
    destroy = vi.fn();
  }
  return { ...discord, Client };
});
vi.mock('../../src/database/connection', () => ({
  connectDatabase: calls.connect,
  disconnectDatabase: vi.fn(),
}));
vi.mock('../../src/commands', () => ({
  loadCommands: vi.fn(),
  registerCommands: calls.registerCommands,
}));
vi.mock('../../src/events', () => ({ registerEvents: calls.registerEvents }));
vi.mock('../../src/interactions', () => ({ registerComponents: vi.fn() }));
vi.mock('../../src/services/twitch-notifier.service', () => ({
  twitchNotifier: { stop: vi.fn() },
}));
vi.mock('../../src/services/youtube-notifier.service', () => ({
  youTubeNotifier: { stop: vi.fn() },
}));
vi.mock('../../src/services/moddb-notifier.service', () => ({ moddbNotifier: { stop: vi.fn() } }));
vi.mock('../../src/services/match-reminder.service', () => ({
  matchReminderService: { stop: vi.fn() },
}));
vi.mock('../../src/services/tournament-scanner.service', () => ({
  tournamentScanner: { stop: vi.fn() },
}));

const originalSend = process.send;
beforeEach(() => {
  vi.clearAllMocks();
  calls.login.mockResolvedValue('test');
  process.send = vi.fn();
  vi.stubEnv('RA3_UPDATE_PROBATION', '1');
});
afterEach(() => {
  process.send = originalSend;
  vi.unstubAllEnvs();
});

describe('managed update probation', () => {
  it('checks migrations and login without registering guild events or changing commands', async () => {
    const bot = new RA3Bot();
    await bot.start();
    expect(calls.connect).toHaveBeenCalledOnce();
    expect(calls.login).toHaveBeenCalledOnce();
    expect(calls.registerEvents).not.toHaveBeenCalled();
    expect(calls.registerCommands).not.toHaveBeenCalled();
    await bot.activate();
    await bot.activate();
    expect(calls.registerEvents).toHaveBeenCalledOnce();
    expect(calls.registerCommands).toHaveBeenCalledOnce();
  });

  it('leaves direct hosting unchanged when no private supervisor IPC exists', async () => {
    process.send = undefined;
    await new RA3Bot().start();
    expect(calls.registerEvents).toHaveBeenCalledOnce();
    expect(calls.registerCommands).toHaveBeenCalledOnce();
  });

  it('never activates after a failed login', async () => {
    calls.login.mockRejectedValueOnce(new Error('login failed'));
    const bot = new RA3Bot();
    await expect(bot.start()).rejects.toThrow('login failed');
    expect(calls.registerEvents).not.toHaveBeenCalled();
    expect(calls.registerCommands).not.toHaveBeenCalled();
  });
});
