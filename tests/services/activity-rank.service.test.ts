import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Collection, GuildMember, Message, Role } from 'discord.js';
import axios from 'axios';
import { connectDatabase } from '../../src/database/connection';
import { activityRankRepository } from '../../src/repositories/activity-rank.repository';
import { guildRepository } from '../../src/repositories/guild.repository';
import {
  ActivityRankService,
  isReplayAttachment,
  MAX_REPLAY_BYTES,
  nextRankForPoints,
  rankForPoints,
  replayFingerprint,
  validateActivityRole,
} from '../../src/services/activity-rank.service';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));
beforeAll(async () => {
  await connectDatabase();
});
beforeEach(() => {
  vi.clearAllMocks();
});
const bytes = () => {
  const b = Buffer.alloc(256);
  b.write('RA3 REPLAY HEADER');
  b[17] = 4;
  return b;
};
const channelId = '1321748469735620640';
const attachment = {
  name: 'game.RA3Replay',
  size: 256,
  url: 'https://cdn.discordapp.com/attachments/' + channelId + '/123/game.RA3Replay',
};

describe('replay screening and roles', () => {
  it('hashes replay headers and rejects renamed non-replays and oversized files', () => {
    expect(replayFingerprint(bytes())).toMatch(/^[a-f0-9]{64}$/);
    expect(replayFingerprint(Buffer.from('not a replay'))).toBeNull();
    expect(replayFingerprint(Buffer.alloc(256))).toBeNull();
    expect(replayFingerprint(Buffer.alloc(MAX_REPLAY_BYTES + 1))).toBeNull();
    const unsupported = bytes();
    unsupported[17] = 99;
    expect(replayFingerprint(unsupported)).toBeNull();
  });
  it('only downloads bounded replay attachments from the correct Discord channel CDN', () => {
    expect(isReplayAttachment(attachment, channelId)).toBe(true);
    for (const url of [
      'http://cdn.discordapp.com/attachments/' + channelId + '/x',
      'https://evil.example/game.RA3Replay',
      'https://cdn.discordapp.com:8443/attachments/' + channelId + '/x',
      'https://cdn.discordapp.com/attachments/other/x',
      'https://user:pass@cdn.discordapp.com/attachments/' + channelId + '/x',
    ])
      expect(isReplayAttachment({ ...attachment, url }, channelId)).toBe(false);
    expect(isReplayAttachment({ ...attachment, name: 'image.png' }, channelId)).toBe(false);
  });
  it('never assigns privileged, managed or uneditable roles', () => {
    const role = {
      id: 'role',
      guild: { id: 'guild', channels: { cache: new Collection() } },
      managed: false,
      editable: true,
      permissions: { bitfield: 0n },
    } as unknown as Role;
    expect(validateActivityRole(role)).toBeNull();
    expect(validateActivityRole({ ...role, permissions: { bitfield: 8n } } as Role)).toContain(
      'cosmetic',
    );
    expect(validateActivityRole({ ...role, editable: false } as Role)).toContain('above');
    expect(validateActivityRole({ ...role, id: 'guild' } as Role)).toContain('ordinary');
  });
  it('blocks zero-permission staff roles and roles with channel grants', () => {
    const id = 'staff-role-safety';
    guildRepository.upsert(id, {
      adminRoleId: '111111111111111111',
      refereeRoleId: '222222222222222222',
    });
    const role = {
      id: '111111111111111111',
      managed: false,
      editable: true,
      permissions: { bitfield: 0n },
      guild: { id, channels: { cache: new Collection() } },
    } as unknown as Role;
    expect(validateActivityRole(role)).toContain('Admin and referee');
    expect(validateActivityRole({ ...role, id: '222222222222222222' } as Role)).toContain(
      'Admin and referee',
    );
    const channelRole = {
      ...role,
      id: '333333333333333333',
      guild: {
        id,
        channels: {
          cache: new Collection([
            [
              'private',
              {
                permissionOverwrites: {
                  cache: new Collection([
                    [
                      '333333333333333333',
                      {
                        allow: { bitfield: 1024n },
                      },
                    ],
                  ]),
                },
              },
            ],
          ]),
        },
      },
    } as unknown as Role;
    expect(validateActivityRole(channelRole)).toContain('channel access');
  });
});

describe('activity event handling', () => {
  function message(guildId: string, overrides: Record<string, unknown> = {}) {
    return {
      guild: { id: guildId, members: { fetch: vi.fn().mockResolvedValue(null) } },
      author: { id: 'member', bot: false },
      system: false,
      webhookId: null,
      channelId,
      createdTimestamp: Date.now(),
      mentions: { roles: new Collection([['ping', {}]]) },
      attachments: new Collection(),
      ...overrides,
    } as unknown as Message;
  }
  it.each(['ra3', 'genevo'] as const)('supports %s and ignores ordinary chat', async (game) => {
    const id = 'service-' + game;
    guildRepository.upsert(id, { game, activityRanksEnabled: 1 });
    guildRepository.setCncPingRole(id, 'ping');
    const service = new ActivityRankService();
    await service.handleMessage(message(id, { mentions: { roles: new Collection() } }));
    expect(activityRankRepository.getMember(id, 'member')).toBeUndefined();
    await service.handleMessage(message(id));
    await service.handleMessage(message(id));
    expect(activityRankRepository.getMember(id, 'member')).toMatchObject({
      points: 25,
      qualifyingCncPings: 1,
    });
  });
  it('checks actual files, persists deduplication and caps download traffic', async () => {
    const id = 'file-service';
    guildRepository.upsert(id, { game: 'genevo', activityRanksEnabled: 1 });
    vi.mocked(axios.get).mockResolvedValue({ data: bytes() });
    const msg = message(id, { attachments: new Collection([['file', attachment]]) });
    for (let n = 0; n < 15; n++) await new ActivityRankService().handleMessage(msg);
    expect(activityRankRepository.getMember(id, 'member')?.qualifyingReplays).toBe(1);
    expect(axios.get).toHaveBeenCalledTimes(6);
    expect(axios.get).toHaveBeenCalledWith(
      attachment.url,
      expect.objectContaining({
        maxRedirects: 0,
        maxContentLength: MAX_REPLAY_BYTES,
        timeout: 8000,
      }),
    );
  });
  it('ignores wrong channels, bots, webhooks and disabled features', async () => {
    const id = 'ignore-service';
    guildRepository.upsert(id, { game: 'ra3', activityRanksEnabled: 1 });
    const service = new ActivityRankService();
    await service.handleMessage(
      message(id, { channelId: 'wrong', attachments: new Collection([['file', attachment]]) }),
    );
    await service.handleMessage(message(id, { author: { id: 'bot', bot: true } }));
    await service.handleMessage(message(id, { webhookId: 'webhook' }));
    guildRepository.toggleFeature(id, 'activityRanks', false);
    await service.handleMessage(
      message(id, { attachments: new Collection([['file', attachment]]) }),
    );
    expect(axios.get).not.toHaveBeenCalled();
  });
  it('blocks roles that acquired permissions after configuration', async () => {
    const id = 'role-service';
    guildRepository.upsert(id, { game: 'ra3', activityRanksEnabled: 1 });
    const rank = activityRankRepository.getRankDefinitions(id)[0];
    activityRankRepository.setRankRole(id, rank.id, '111111111111111111', 0);
    const activity = activityRankRepository.adjustPoints(id, 'member', 1250);
    const role = {
      id: '111111111111111111',
      guild: { id },
      managed: false,
      editable: true,
      permissions: { bitfield: 8n },
    };
    const add = vi.fn();
    const member = {
      id: 'member',
      user: { bot: false },
      guild: {
        id,
        roles: { cache: new Collection([[role.id, role]]) },
        members: { me: { permissions: { has: () => true } }, fetch: vi.fn() },
      },
      roles: { cache: new Collection(), add, remove: vi.fn() },
    } as unknown as GuildMember;
    vi.mocked(member.guild.members.fetch).mockResolvedValue(member as any);
    expect((await new ActivityRankService().syncMemberRank(member, activity)).status).toBe(
      'blocked_role',
    );
    expect(add).not.toHaveBeenCalled();
  });
  it('selects current and next ranks at exact thresholds', () => {
    const definitions = [
      { id: 1, rank: 1, title: 'First', threshold: 1250 },
      { id: 2, rank: 2, title: 'Second', threshold: 2500 },
    ];
    expect(rankForPoints(1249, definitions)).toBeUndefined();
    expect(rankForPoints(1250, definitions)?.title).toBe('First');
    expect(nextRankForPoints(1250, definitions)?.title).toBe('Second');
    expect(nextRankForPoints(2500, definitions)).toBeUndefined();
  });
  it('serializes rank updates and uses the latest staff override rather than an old XP snapshot', async () => {
    const id = 'queued-role-service';
    guildRepository.upsert(id, { game: 'genevo', activityRanksEnabled: 1 });
    const definitions = activityRankRepository.getRankDefinitions(id);
    const firstId = '111111111111111111',
      secondId = '222222222222222222';
    activityRankRepository.setRankRole(id, definitions[0].id, firstId, 0);
    activityRankRepository.setRankRole(id, definitions[1].id, secondId, 1);
    const old = activityRankRepository.adjustPoints(id, 'member', 2500);
    const cache = new Collection<string, any>();
    let release!: () => void;
    const guild: any = {
      id,
      channels: { cache: new Collection() },
      roles: { cache: new Collection() },
      members: { fetch: vi.fn(), me: { permissions: { has: () => true } } },
    };
    for (const roleId of [firstId, secondId])
      guild.roles.cache.set(roleId, {
        id: roleId,
        guild,
        managed: false,
        editable: true,
        permissions: { bitfield: 0n },
      });
    const member: any = {
      id: 'member',
      guild,
      user: { bot: false },
      roles: {
        cache,
        add: vi.fn(async (role) => {
          cache.set(role.id, role);
          if (role.id === secondId)
            await new Promise<void>((resolve) => {
              release = resolve;
            });
        }),
        remove: vi.fn(async (roles) => {
          for (const role of roles) cache.delete(role.id);
        }),
      },
    };
    guild.members.fetch.mockResolvedValue(member);
    const service = new ActivityRankService();
    const initial = service.syncMemberRank(member, old);
    await vi.waitFor(() => expect(release).toBeDefined());
    activityRankRepository.setManualRank(id, 'member', definitions[0].id);
    const pinned = service.syncMemberRank(member, old);
    expect(member.roles.add).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([initial, pinned]);
    expect([...cache.keys()]).toEqual([firstId]);
    expect(activityRankRepository.getMember(id, 'member')?.manualRankId).toBe(definitions[0].id);
    guildRepository.toggleFeature(id, 'activityRanks', false);
    expect((await service.syncMemberRank(member)).status).toBe('disabled');
  });
});
