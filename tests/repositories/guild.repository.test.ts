import { describe, it, expect, beforeAll } from 'vitest';
import { connectDatabase } from '../../src/database/connection';
import { GuildRepository } from '../../src/repositories/guild.repository';

const repo = new GuildRepository();

beforeAll(async () => {
  await connectDatabase();
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

  it('activity ranks are opt-in and use a whitelisted feature toggle', () => {
    repo.upsert('activity-guild', {});
    expect(repo.findByDiscordId('activity-guild')?.activityRanksEnabled).toBe(0);
    repo.toggleFeature('activity-guild', 'activityRanks', true);
    expect(repo.findByDiscordId('activity-guild')?.activityRanksEnabled).toBe(1);
    repo.setCncPingRole('activity-guild', 'cnc-role');
    expect(repo.findByDiscordId('activity-guild')?.cncPingRoleId).toBe('cnc-role');
    repo.setCncPingRole('activity-guild', null);
    expect(repo.findByDiscordId('activity-guild')?.cncPingRoleId).toBeUndefined();
  });

  it('updateNotifyChannel rejects unknown categories (SQL-injection guard)', () => {
    expect(() => repo.updateNotifyChannel('guild1', 'clans; DROP TABLE guilds', null)).toThrow();
  });

  it('updateNotifyChannel accepts known categories', () => {
    repo.updateNotifyChannel('guild1', 'twitch', 'channel1');
    expect(repo.findByDiscordId('guild1')?.twitchChannelId).toBe('channel1');
  });
});
