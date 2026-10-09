import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Collection, Guild } from 'discord.js';
import { connectDatabase } from '../../src/database/connection';
import { activityRankRepository as repo } from '../../src/repositories/activity-rank.repository';
import { guildRepository } from '../../src/repositories/guild.repository';
import {
  activityControlId,
  authorizeActivityControl,
  buildActivityAdminView,
  parseActivityControl,
} from '../../src/commands/admin/activity-admin.view';
import {
  data as activityData,
  execute as openActivity,
} from '../../src/commands/admin/activity-admin.command';
import {
  data as setupData,
  execute as openSetup,
} from '../../src/commands/setup/setup-wizard.command';
import { execute as button } from '../../src/interactions/buttons/activity-admin.button';
import { execute as modal } from '../../src/interactions/modals/activity-admin.modal';
import { execute as select } from '../../src/interactions/selectMenus/activity-admin.select';
import { execute as setAdmin } from '../../src/interactions/selectMenus/setup-admin-role.select';
import { execute as setReferee } from '../../src/interactions/selectMenus/setup-referee-role.select';
import { execute as setGame } from '../../src/interactions/selectMenus/setup-game.select';
import { execute as linkTournament } from '../../src/interactions/modals/tournament-link.modal';
import { activityRankService } from '../../src/services/activity-rank.service';
import { setFeatureState } from '../../src/commands/setup/feature-toggle.view';

const ownerId = '222222222222222222';
const memberId = '1542304495990476880';
let sequence = 0;
beforeAll(async () => {
  await connectDatabase();
});
beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(activityRankService, 'syncMemberRank').mockResolvedValue({ status: 'updated' });
  vi.spyOn(activityRankService, 'syncGuild').mockResolvedValue({
    updated: 1,
    unchanged: 0,
    failed: 0,
  });
});

function fixture(admin = true) {
  const id = String(900000000000000000n + BigInt(++sequence));
  guildRepository.upsert(id, { game: 'ra3', adminRoleId: '333333333333333333' });
  const current = {
    id: ownerId,
    guild: { id, ownerId: 'other' },
    user: { bot: false },
    permissions: { has: () => false },
    roles: { cache: new Collection(admin ? [['333333333333333333', {}]] : []) },
  };
  const role = {
    id: '444444444444444444',
    guild: { id, channels: { cache: new Collection() } },
    managed: false,
    editable: true,
    permissions: { bitfield: 0n },
    delete: vi.fn(),
  };
  const guild = {
    id,
    members: {
      fetch: vi.fn().mockResolvedValue(current),
      me: { permissions: { has: () => true } },
    },
    roles: { fetch: vi.fn().mockResolvedValue(role), create: vi.fn().mockResolvedValue(role) },
    channels: { fetch: vi.fn().mockResolvedValue({ id: '555555555555555555', type: 0 }) },
  } as unknown as Guild;
  const interaction: any = {
    guild,
    user: { id: ownerId },
    reply: vi.fn(),
    followUp: vi.fn(),
    editReply: vi.fn(),
    update: vi.fn(),
    showModal: vi.fn(),
    deferUpdate: vi.fn(async () => {
      interaction.deferred = true;
    }),
    deferReply: vi.fn(async () => {
      interaction.deferred = true;
    }),
    fields: { getTextInputValue: vi.fn() },
    values: [],
    isFromMessage: () => true,
    isStringSelectMenu: () => false,
    isUserSelectMenu: () => false,
    isRoleSelectMenu: () => false,
    isChannelSelectMenu: () => false,
  };
  function control(kind: 'btn' | 'sel' | 'modal', action: string, ref: string | number = 0) {
    interaction.customId = activityControlId(
      kind,
      action,
      ref,
      repo.getSettings(id).version,
      ownerId,
    );
    return interaction;
  }
  return { id, guild, interaction, current, role, control };
}

describe('activity admin permissions and rendering', () => {
  it('keeps snowflakes as strings and rejects malformed controls', () => {
    const id = activityControlId('btn', 'member', memberId, 3, ownerId);
    expect(parseActivityControl(id)).toMatchObject({ ref: memberId, version: 3 });
    expect(parseActivityControl('activity_btn:member:-1:3:' + ownerId)).toBeNull();
    expect(
      parseActivityControl('activity_btn:member:0:99999999999999999999:' + ownerId),
    ).toBeNull();
  });
  it('allows configured bot-admin roles without Discord Administrator for both commands', async () => {
    expect(setupData.toJSON().default_member_permissions).toBeNull();
    expect(activityData.toJSON().default_member_permissions).toBeNull();
    const f = fixture();
    await openSetup(null as any, f.interaction);
    await openActivity(null as any, f.interaction);
    expect(f.interaction.reply).toHaveBeenCalledTimes(2);
    expect(f.interaction.reply.mock.calls[0][0].embeds[0].data.title).toContain('Setup');
  });
  it('requires current privileges, menu ownership and a current config version', async () => {
    const f = fixture(false);
    const i = f.control('btn', 'enable');
    expect(await authorizeActivityControl(i)).toBeNull();
    expect(f.guild.members.fetch).toHaveBeenCalledWith({ user: ownerId, force: true });
    const own = fixture();
    const stale = own.control('btn', 'enable');
    repo.updateSettings(own.id, { daysPerRank: 51 }, 0);
    expect(await authorizeActivityControl(stale)).toBeNull();
    expect(stale.reply.mock.calls[0][0].content).toContain('another menu');
    const foreign = fixture();
    foreign.control('btn', 'enable');
    foreign.interaction.user.id = memberId;
    expect(await authorizeActivityControl(foreign.interaction)).toBeNull();
  });
  it.each([
    'main',
    'sources',
    'ranks',
    'rank',
    'role',
    'ping',
    'replay',
    'members',
    'member',
    'delete',
    'reset',
  ] as const)('serializes the %s screen within Discord limits', (screen) => {
    const f = fixture();
    const rank = repo.getRankDefinitions(f.id)[0];
    const ref = ['member', 'reset'].includes(screen)
      ? memberId
      : ['rank', 'role', 'delete'].includes(screen)
        ? rank.id
        : 0;
    const view = buildActivityAdminView(f.guild, ownerId, screen, ref);
    expect(view.components.length).toBeLessThanOrEqual(5);
    for (const row of view.components) {
      const json = row.toJSON();
      expect(json.components.length).toBeLessThanOrEqual(5);
      for (const component of json.components)
        expect(component.custom_id?.length).toBeLessThanOrEqual(100);
    }
    expect(view.embeds[0].toJSON().description?.length ?? 0).toBeLessThanOrEqual(4096);
  });
  it('paginates 100 ranks rather than exceeding the 25-option select limit', () => {
    const f = fixture();
    for (let n = 9; n < 100; n++) repo.addRank(f.id, 'Rank ' + n, repo.getSettings(f.id).version);
    for (let page = 0; page < 4; page++) {
      const view = buildActivityAdminView(f.guild, ownerId, 'ranks', page);
      expect((view.components[0].toJSON().components[0] as any).options).toHaveLength(25);
    }
  });
  it.each(['ra3', 'genevo'] as const)('exposes the feature toggle in %s', (game) => {
    const f = fixture();
    guildRepository.setGame(f.id, game);
    setFeatureState(f.id, 'activityRanks', true);
    expect(guildRepository.findByDiscordId(f.id)?.activityRanksEnabled).toBe(1);
  });
});

describe('activity controls', () => {
  it.each(['main', 'sources', 'ranks', 'ping', 'replay', 'members'])(
    'navigates %s',
    async (action) => {
      const f = fixture();
      await button(null as any, f.control('btn', action));
      expect(f.interaction.update).toHaveBeenCalledOnce();
    },
  );
  it.each(['xp', 'days', 'add', 'edit', 'adjust'])('opens a valid %s modal', async (action) => {
    const f = fixture();
    const ref =
      action === 'edit' ? repo.getRankDefinitions(f.id)[0].id : action === 'adjust' ? memberId : 0;
    await button(null as any, f.control('btn', action, ref));
    const form = f.interaction.showModal.mock.calls[0][0].toJSON();
    expect(form.components.length).toBeLessThanOrEqual(5);
    for (const row of form.components)
      expect(row.components[0].label.length).toBeLessThanOrEqual(45);
  });
  it.each(['enable', 'disable', 'toggle_ping', 'toggle_replay', 'clear_ping', 'sync'])(
    'handles %s',
    async (action) => {
      const f = fixture();
      await button(null as any, f.control('btn', action));
      expect(f.interaction.followUp).not.toHaveBeenCalled();
      expect(f.interaction.reply).not.toHaveBeenCalled();
      expect(
        f.interaction.update.mock.calls.length + f.interaction.editReply.mock.calls.length,
      ).toBe(1);
    },
  );
  it.each(['up', 'down', 'detach', 'delete_confirm', 'create'])(
    'handles rank action %s',
    async (action) => {
      const f = fixture();
      const rank = repo.getRankDefinitions(f.id)[1];
      await button(null as any, f.control('btn', action, rank.id));
      expect(f.interaction.followUp).not.toHaveBeenCalled();
      expect(f.interaction.reply).not.toHaveBeenCalled();
      if (action === 'create')
        expect(f.guild.roles.create).toHaveBeenCalledWith(
          expect.objectContaining({ permissions: [], mentionable: false }),
        );
    },
  );
  it('requires confirmation before reset and safely acknowledges a long-running role sync', async () => {
    const f = fixture();
    repo.adjustPoints(f.id, memberId, 100);
    await button(null as any, f.control('btn', 'reset', memberId));
    expect(repo.getMember(f.id, memberId)?.points).toBe(100);
    await button(null as any, f.control('btn', 'reset_confirm', memberId));
    expect(repo.getMember(f.id, memberId)?.points).toBe(0);
    expect(f.interaction.deferUpdate).toHaveBeenCalledOnce();
  });
  it.each(['xp', 'days', 'add', 'edit', 'adjust'])('submits %s', async (action) => {
    const f = fixture();
    const ref =
      action === 'edit' ? repo.getRankDefinitions(f.id)[0].id : action === 'adjust' ? memberId : 0;
    const fields: Record<string, string> = {
      ping_xp: '30',
      replay_xp: '20',
      replay_cap: '2',
      level_xp: '100',
      per_rank: '50',
      max_days: '90',
      name: 'Custom',
      threshold: '1300',
      amount: '50',
    };
    f.interaction.fields.getTextInputValue.mockImplementation((name: string) => fields[name]);
    await modal(null as any, f.control('modal', action, ref));
    expect(f.interaction.followUp).not.toHaveBeenCalled();
    expect(f.interaction.reply).not.toHaveBeenCalled();
    if (action === 'adjust') expect(repo.getMember(f.id, memberId)?.points).toBe(50);
  });
  it.each(['rank', 'role', 'ping', 'replay', 'member'])('handles %s selection', async (action) => {
    const f = fixture();
    const rank = repo.getRankDefinitions(f.id)[0];
    f.interaction.values = [
      action === 'rank' ? String(rank.id) : action === 'member' ? memberId : '444444444444444444',
    ];
    f.interaction.isStringSelectMenu = () => action === 'rank';
    f.interaction.isRoleSelectMenu = () => ['role', 'ping'].includes(action);
    f.interaction.isChannelSelectMenu = () => action === 'replay';
    f.interaction.isUserSelectMenu = () => action === 'member';
    await select(null as any, f.control('sel', action, action === 'role' ? rank.id : 0));
    expect(f.interaction.reply).not.toHaveBeenCalled();
    expect(f.interaction.update).toHaveBeenCalledOnce();
  });
  it.each([setAdmin, setReferee, setGame, linkTournament])(
    'blocks stale setup/tournament mutations after admin privileges are revoked',
    async (handler) => {
      const f = fixture(false);
      f.interaction.values = ['genevo'];
      await handler(null as any, f.interaction);
      expect(f.interaction.reply.mock.calls[0][0].content).toContain('configured admin role');
      expect(f.guild.roles.fetch).not.toHaveBeenCalled();
      expect(guildRepository.findByDiscordId(f.id)?.game).toBe('ra3');
    },
  );
  it('rejects @everyone as the bot admin role', async () => {
    const f = fixture();
    f.interaction.values = [f.id];
    f.role.id = f.id;
    await setAdmin(null as any, f.interaction);
    expect(f.interaction.reply.mock.calls[0][0].content).toContain('@everyone');
    expect(guildRepository.findByDiscordId(f.id)?.adminRoleId).toBe('333333333333333333');
  });
});
