import { describe, it, expect, beforeAll } from 'vitest';
import { up as up001 } from '../../src/database/migrations/001_initial_schema';
import { GuildRepository } from '../../src/repositories/guild.repository';

const repo = new GuildRepository();

beforeAll(() => {
  up001();
});

describe('GuildRepository — column whitelists', () => {
  it('toggleFeature rejects unknown feature keys', () => {
    expect(() => repo.toggleFeature('guild1', 'not_a_feature', true)).toThrow();
  });

  it('toggleFeature accepts known keys and persists the toggle', () => {
    repo.upsert('guild1', {});
    repo.toggleFeature('guild1', 'clans', true);
    expect(repo.findByDiscordId('guild1')?.clansEnabled).toBe(1);
  });

  it('updateNotifyChannel rejects unknown categories (SQL-injection guard)', () => {
    expect(() => repo.updateNotifyChannel('guild1', 'clans; DROP TABLE guilds', null)).toThrow();
  });

  it('updateNotifyChannel accepts known categories', () => {
    repo.updateNotifyChannel('guild1', 'twitch', 'channel1');
    expect(repo.findByDiscordId('guild1')?.twitchChannelId).toBe('channel1');
  });
});
