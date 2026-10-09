import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Collection, PermissionFlagsBits } from 'discord.js';
import { connectDatabase } from '../../src/database/connection';
import { guildRepository } from '../../src/repositories/guild.repository';
import { activityRankRepository as activity } from '../../src/repositories/activity-rank.repository';
import { userRepository } from '../../src/repositories/user.repository';
import { execute as activityCommand } from '../../src/commands/community/activity.command';
import {
  execute as profileCommand,
  buildDiscordProfileEmbed,
} from '../../src/commands/profile/profile.command';
import { activityRankService } from '../../src/services/activity-rank.service';
import { ra3StatsService } from '../../src/services/ra3-stats.service';
import { shatabrickService, SHATABRICK_MODE_LABELS } from '../../src/services/shatabrick.service';
beforeAll(async () => {
  await connectDatabase();
});
beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(activityRankService, 'syncMemberRank').mockResolvedValue({ status: 'updated' });
  vi.spyOn(ra3StatsService, 'fetch').mockResolvedValue({ tournament_wins: {} } as any);
  vi.spyOn(shatabrickService, 'resolve').mockResolvedValue(null);
});
let sequence = 0;
function fixture(action = 'leaderboard', moderator = false) {
  const id = 'activity-profile-' + ++sequence;
  guildRepository.upsert(id, { game: 'genevo', activityRanksEnabled: 1 });
  const target = {
    id: 'target' + sequence,
    displayName: 'Player',
    username: 'player',
    bot: false,
    displayAvatarURL: () => 'https://example.com/avatar.png',
  };
  const guild: any = {
    id,
    ownerId: 'owner',
    channels: { fetch: vi.fn(), cache: new Collection() },
    roles: { fetch: vi.fn(), cache: new Collection() },
    members: { fetch: vi.fn() },
  };
  const staff: any = {
    id: 'staff',
    guild,
    permissions: { has: (bit: bigint) => moderator && bit === PermissionFlagsBits.ManageMessages },
    roles: { cache: new Collection() },
  };
  const member = { id: target.id, guild, user: target, displayName: 'Player' };
  guild.members.fetch.mockImplementation(async (arg: any) =>
    (arg.user ?? arg) === 'staff' ? staff : member,
  );
  const i: any = {
    guild,
    guildId: id,
    user: { id: 'staff' },
    reply: vi.fn(),
    editReply: vi.fn(),
    deferReply: vi.fn(),
    options: {
      getSubcommand: () => action,
      getUser: () => target,
      getString: () => null,
      getInteger: () => 50,
      getRole: () => null,
    },
  };
  return { id, i, guild, target, staff, member };
}
describe('private activity and staff tools', () => {
  it('shows the leaderboard only to the invoker', async () => {
    const f = fixture();
    activity.adjustPoints(f.id, f.target.id, 50);
    await activityCommand(null as any, f.i);
    expect(f.i.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(f.i.editReply.mock.calls[0][0].embeds[0].data.description).toContain('50 XP');
  });
  it('blocks ordinary members before any XP adjustment', async () => {
    const f = fixture('xp');
    await activityCommand(null as any, f.i);
    expect(f.i.reply.mock.calls[0][0].ephemeral).toBe(true);
    expect(activity.getMember(f.id, f.target.id)).toBeUndefined();
  });
  it('allows moderators to add and remove XP with fresh permissions and private replies', async () => {
    const f = fixture('xp', true);
    await activityCommand(null as any, f.i);
    expect(f.guild.members.fetch).toHaveBeenCalledWith({ user: 'staff', force: true });
    expect(f.i.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(activity.getMember(f.id, f.target.id)?.points).toBe(50);
    f.i.options.getInteger = () => -75;
    await activityCommand(null as any, f.i);
    expect(activity.getMember(f.id, f.target.id)?.points).toBe(0);
  });
  it('only assigns configured cosmetic rank roles and preserves staff overrides', async () => {
    const f = fixture('role', true);
    const rank = activity.getRankDefinitions(f.id)[0];
    activity.setRankRole(f.id, rank.id, '111111111111111111', 0);
    const role = {
      id: '111111111111111111',
      guild: f.guild,
      managed: false,
      editable: true,
      permissions: { bitfield: 8n },
    };
    f.guild.roles.cache.set(role.id, role);
    f.i.options.getRole = () => role;
    f.i.options.getString = () => 'add';
    await activityCommand(null as any, f.i);
    expect(f.i.editReply.mock.calls[0][0].content).toContain('cosmetic');
    expect(activity.getMember(f.id, f.target.id)).toBeUndefined();
    role.permissions.bitfield = 0n;
    await activityCommand(null as any, f.i);
    expect(activity.getMember(f.id, f.target.id)?.manualRankId).toBe(rank.id);
    f.i.options.getString = () => 'remove';
    await activityCommand(null as any, f.i);
    expect(activity.getMember(f.id, f.target.id)?.manualRankId).toBe(0);
    f.i.options.getString = () => 'auto';
    await activityCommand(null as any, f.i);
    expect(activity.getMember(f.id, f.target.id)?.manualRankId).toBeUndefined();
  });
});
describe('readable private profile', () => {
  it('defers privately before provider requests and includes server activity', async () => {
    const f = fixture();
    activity.adjustPoints(f.id, f.target.id, 1250);
    await profileCommand(null as any, f.i);
    expect(f.i.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(f.i.deferReply.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(ra3StatsService.fetch).mock.invocationCallOrder[0],
    );
    const embed = f.i.editReply.mock.calls[0][0].embeds[0].toJSON();
    expect(embed.fields.find((field: any) => field.name === '🎖️ Server Activity').value).toContain(
      'Private',
    );
    expect(JSON.stringify(embed)).not.toContain('\u2014');
    expect(JSON.stringify(embed)).not.toContain('C&C ping');
  });
  it('uses readable full-width rows, avoids duplicated levels and calculates wins from decided games', async () => {
    const f = fixture();
    userRepository.linkShatabrick(f.target.id, 'Arcy');
    const modes: any = Object.fromEntries(
      SHATABRICK_MODE_LABELS.map((name) => [name, { games: 0, wins: 0, losses: 0 }]),
    );
    modes['Ranked 1v1'] = { games: 45, wins: 4, losses: 1, elo: 1087, rank: 21 };
    vi.mocked(shatabrickService.resolve).mockResolvedValue({
      nickname: 'Arcy',
      profileUrl: 'https://www.shatabrick.com/profile',
      rankLabel: 'Level 13',
      level: 13,
      score: 227,
      modes,
    } as any);
    const embed = (await buildDiscordProfileEmbed(f.target as any, 'en', 'ra3', f.id)).toJSON();
    expect(embed.fields!.filter((field) => field.inline)).toHaveLength(0);
    expect(embed.fields!.find((field) => field.name === 'Ranked 1v1')!.value).toContain(
      '80% win rate',
    );
    expect(JSON.stringify(embed).match(/Level/g)).toHaveLength(2); // Server level and platform level.
    expect(embed.fields!.some((field) => field.name === 'Clan 1v1')).toBe(false);
  });
});
