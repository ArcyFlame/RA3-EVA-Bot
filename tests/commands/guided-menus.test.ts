import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Collection, MessageFlags, ChannelType } from 'discord.js';
import { connectDatabase } from '../../src/database/connection';
import { guildRepository } from '../../src/repositories/guild.repository';
import { userRepository } from '../../src/repositories/user.repository';
import { tournamentRepository as tournaments } from '../../src/repositories/tournament.repository';
import { tournamentAccessRepository as access } from '../../src/repositories/tournament-access.repository';
import { openPanelMenu, handlePanelMenu } from '../../src/commands/admin/panel-menu.view';
import * as stats from '../../src/commands/admin/stats-panel.command';
import * as matches from '../../src/commands/admin/match-panel.command';
import * as lobby from '../../src/commands/admin/lobby-panel.command';
import {
  openProfileAdminMenu,
  handleProfileAdminMenu,
} from '../../src/commands/admin/profile-admin-menu.view';
import {
  openTournamentMenu,
  handleTournamentMenu,
} from '../../src/commands/tournaments/tournament-menu.view';
import * as reporter from '../../src/commands/tournaments/report-score.command';
import { buildActivityAdminView } from '../../src/commands/admin/activity-admin.view';
import { replayLibraryView } from '../../src/commands/replays/replay-library.view';
import { PrivateMenuSessions } from '../../src/utils/private-menu-session';

beforeAll(connectDatabase);
beforeEach(() => vi.restoreAllMocks());
let seq = 0;
const owner = '123456789012345678';
const actor = '222222222222222222';
const target = '333333333333333333';

function fixture(userId = actor, admin = true) {
  const guildId = String(800000000000000000n + BigInt(++seq));
  const channelId = String(700000000000000000n + BigInt(seq));
  guildRepository.upsert(guildId, { game: 'genevo', tournamentsEnabled: 1, lobbyEnabled: 1 });
  const member: any = {
    id: userId,
    user: { id: userId, bot: false, displayName: 'Member' },
    guild: { id: guildId, ownerId: 'unrelated' },
    roles: { cache: new Collection() },
    permissions: { has: () => admin },
  };
  const selected: any = {
    ...member,
    id: target,
    user: { id: target, bot: false, displayName: 'Selected' },
  };
  const channel: any = {
    id: channelId,
    guildId,
    type: ChannelType.GuildText,
    permissionsFor: () => ({ has: () => true }),
  };
  const guild: any = {
    id: guildId,
    name: 'Test Server',
    members: {
      fetch: vi.fn(async (value: any) =>
        (typeof value === 'string' ? value : value.user) === target ? selected : member,
      ),
    },
    channels: { fetch: vi.fn().mockResolvedValue(channel), cache: new Collection() },
  };
  const i: any = {
    guild,
    guildId,
    user: member.user,
    member,
    message: { flags: { has: (flag: number) => flag === MessageFlags.Ephemeral } },
    reply: vi.fn(),
    update: vi.fn(),
    editReply: vi.fn(),
    followUp: vi.fn(),
    deferReply: vi.fn(),
    showModal: vi.fn(),
    isModalSubmit: () => false,
    isButton: () => true,
    isStringSelectMenu: () => false,
    isUserSelectMenu: () => false,
    isChannelSelectMenu: () => false,
    inCachedGuild: () => true,
  };
  const bot: any = {
    client: { user: { id: 'bot' }, guilds: { cache: new Collection([[guildId, guild]]) } },
  };
  return { i, bot, guild, guildId, channel, channelId, member, selected };
}
function id(payload: any, action: string) {
  const control = payload.components
    .flatMap((row: any) => row.toJSON().components)
    .find((entry: any) => entry.custom_id?.split(':')[1] === action);
  expect(control, `missing ${action} control`).toBeDefined();
  return control.custom_id as string;
}
function step(
  f: ReturnType<typeof fixture>,
  customId: string,
  kind = 'button',
  values: string[] = [],
) {
  for (const name of ['reply', 'update', 'editReply', 'deferReply', 'showModal'])
    f.i[name].mockClear();
  f.i.customId = customId;
  f.i.values = values;
  f.i.isModalSubmit = () => kind === 'modal';
  f.i.isButton = () => kind === 'button';
  f.i.isStringSelectMenu = () => kind === 'string';
  f.i.isUserSelectMenu = () => kind === 'user';
  f.i.isChannelSelectMenu = () => kind === 'channel';
  f.i.deferred = false;
  f.i.replied = false;
}
function event(f: ReturnType<typeof fixture>) {
  const eventId = tournaments.createEvent({
    game: 'genevo',
    eventUrl: `https://example.com/menu-${seq}`,
    title: `Menu Cup ${seq}`,
    announcedAt: new Date().toISOString(),
    startDate: '1 Jan 2099',
  });
  tournaments.setEventStatus(eventId, 'registration');
  access.setOrganizer(eventId, f.guildId);
  return eventId;
}

describe('guided panel configuration', () => {
  it.each(['stats', 'matches', 'lobby'] as const)(
    'selects and confirms a %s channel once',
    async (kind) => {
      const f = fixture();
      const apply =
        kind === 'stats'
          ? vi.spyOn(stats, 'applyStatsPanel')
          : kind === 'matches'
            ? vi.spyOn(matches, 'applyMatchPanel')
            : vi.spyOn(lobby, 'applyLobbyPanel');
      apply.mockResolvedValue(undefined);
      await openPanelMenu(f.i, kind);
      let payload = f.i.reply.mock.calls[0][0];
      expect(payload.ephemeral).toBe(true);
      step(f, id(payload, 'channel'), 'channel', [f.channelId]);
      await handlePanelMenu(f.bot, f.i);
      payload = f.i.update.mock.calls[0][0];
      step(f, id(payload, 'save'));
      await Promise.all([handlePanelMenu(f.bot, f.i), handlePanelMenu(f.bot, f.i)]);
      expect(apply).toHaveBeenCalledExactlyOnceWith(f.bot, f.i, 'set', f.channel);
    },
  );
  it('blocks a revoked admin and a channel from another server', async () => {
    const f = fixture();
    const apply = vi.spyOn(stats, 'applyStatsPanel').mockResolvedValue(undefined);
    await openPanelMenu(f.i, 'stats');
    const payload = f.i.reply.mock.calls[0][0];
    step(f, id(payload, 'channel'), 'channel', [f.channelId]);
    f.channel.guildId = 'foreign';
    await handlePanelMenu(f.bot, f.i);
    expect(f.i.update).not.toHaveBeenCalled();
    f.channel.guildId = f.guildId;
    f.member.permissions.has = () => false;
    await handlePanelMenu(f.bot, f.i);
    expect(apply).not.toHaveBeenCalled();
  });
});

describe('profile menu', () => {
  it('requires confirmation to remove the selected owner identity and consumes the action', async () => {
    const f = fixture();
    userRepository.linkRa3BattleNet(actor, 'Player', 123);
    await openProfileAdminMenu(f.i, actor);
    const payload = f.i.reply.mock.calls[0][0];
    step(f, id(payload, 'ra3b'));
    await handleProfileAdminMenu(f.i);
    expect(userRepository.findByDiscordId(actor)?.ra3bPersonaId).toBe(123);
    step(f, id(f.i.update.mock.calls[0][0], 'confirm'));
    await handleProfileAdminMenu(f.i);
    expect(userRepository.findByDiscordId(actor)?.ra3bPersonaId).toBeUndefined();
    userRepository.linkRa3BattleNet(actor, 'NewPlayer', 456);
    await handleProfileAdminMenu(f.i);
    expect(userRepository.findByDiscordId(actor)?.ra3bPersonaId).toBe(456);
  });
  it('hides unlink actions for another member and detects links changed during confirmation', async () => {
    const f = fixture();
    await openProfileAdminMenu(f.i, target);
    expect(JSON.stringify(f.i.reply.mock.calls[0][0])).not.toContain('Unlink RA3BattleNet');
    userRepository.linkRa3BattleNet(actor, 'Before', 1);
    f.i.reply.mockClear();
    await openProfileAdminMenu(f.i, actor);
    step(f, id(f.i.reply.mock.calls[0][0], 'ra3b'));
    await handleProfileAdminMenu(f.i);
    const confirm = id(f.i.update.mock.calls[0][0], 'confirm');
    userRepository.linkRa3BattleNet(actor, 'After', 2);
    step(f, confirm);
    await handleProfileAdminMenu(f.i);
    expect(userRepository.findByDiscordId(actor)?.ra3bPersonaId).toBe(2);
  });
});

describe('tournament menus', () => {
  it('selects an event before opening a private check-in board', async () => {
    const f = fixture(actor, false);
    const eventId = event(f);
    await openTournamentMenu(f.bot, f.i, 'checkin');
    step(f, id(f.i.reply.mock.calls[0][0], 'event'), 'string', [String(eventId)]);
    await handleTournamentMenu(f.bot, f.i);
    step(f, id(f.i.update.mock.calls[0][0], 'open'));
    await handleTournamentMenu(f.bot, f.i);
    const text = JSON.stringify(f.i.update.mock.calls[0][0]);
    expect(text).toContain(`checkin_yes_${eventId}_player`);
    expect(text).not.toContain('Post Check-in Board');
  });
  it('verifies a selected member/player association only after confirmation', async () => {
    const f = fixture();
    const eventId = event(f);
    tournaments.addParticipant(eventId, 'RegisteredPlayer', 'forum');
    const player = tournaments.getParticipants(eventId)[0];
    await openTournamentMenu(f.bot, f.i, 'participant', eventId);
    step(f, id(f.i.reply.mock.calls[0][0], 'member'), 'user', [target]);
    await handleTournamentMenu(f.bot, f.i);
    step(f, id(f.i.update.mock.calls[0][0], 'player'), 'string', [String(player.id)]);
    await handleTournamentMenu(f.bot, f.i);
    expect(tournaments.getParticipants(eventId)[0].discordId).toBeUndefined();
    step(f, id(f.i.update.mock.calls[0][0], 'associate'));
    await handleTournamentMenu(f.bot, f.i);
    expect(tournaments.findParticipantByDiscord(eventId, target)?.name).toBe('RegisteredPlayer');
  });
  it('does not revoke organizer authorization by opening the menu, and requires a confirmation', async () => {
    const f = fixture(owner);
    const eventId = event(f);
    await openTournamentMenu(f.bot, f.i, 'organizer', eventId);
    expect(access.organizer(eventId)).toBe(f.guildId);
    step(f, id(f.i.reply.mock.calls[0][0], 'revoke'));
    await handleTournamentMenu(f.bot, f.i);
    expect(access.organizer(eventId)).toBe(f.guildId);
    step(f, id(f.i.update.mock.calls[0][0], 'confirmrevoke'));
    await handleTournamentMenu(f.bot, f.i);
    expect(access.organizer(eventId)).toBeUndefined();
  });
  it('collects opponent, faction and score and pins the report to the chosen tournament', async () => {
    const f = fixture(actor, false);
    const eventId = event(f);
    tournaments.addParticipant(eventId, 'Opponent', 'discord', target);
    tournaments.setCheckedInByDiscord(eventId, target, true);
    const player = tournaments.findParticipantByDiscord(eventId, target)!;
    const submit = vi.spyOn(reporter, 'submitScore').mockResolvedValue(undefined);
    await openTournamentMenu(f.bot, f.i, 'report', eventId);
    step(f, id(f.i.reply.mock.calls[0][0], 'player'), 'string', [String(player.id)]);
    await handleTournamentMenu(f.bot, f.i);
    step(f, id(f.i.update.mock.calls[0][0], 'factions'), 'string', ['UvC']);
    await handleTournamentMenu(f.bot, f.i);
    step(f, id(f.i.update.mock.calls[0][0], 'score'));
    await handleTournamentMenu(f.bot, f.i);
    const modal = f.i.showModal.mock.calls[0][0].toJSON();
    step(f, modal.custom_id, 'modal');
    f.i.fields = { getTextInputValue: (key: string) => (key === 'your' ? '3' : '2') };
    await handleTournamentMenu(f.bot, f.i);
    expect(submit).not.toHaveBeenCalled();
    step(f, id(f.i.reply.mock.calls[0][0], 'submit'));
    await handleTournamentMenu(f.bot, f.i);
    expect(submit).toHaveBeenCalledExactlyOnceWith(f.bot, f.i, {
      opponent: 'Opponent',
      factions: 'UvC',
      score: '3-2',
      eventId,
    });
  });
  it('paginates players and rejects a revoked organizer while a menu is open', async () => {
    const f = fixture();
    const eventId = event(f);
    for (let n = 0; n < 27; n++) tournaments.addParticipant(eventId, `Player ${n}`, 'forum');
    await openTournamentMenu(f.bot, f.i, 'participant', eventId);
    step(f, id(f.i.reply.mock.calls[0][0], 'next'));
    await handleTournamentMenu(f.bot, f.i);
    const rows = f.i.update.mock.calls[0][0].components.map((row: any) => row.toJSON());
    expect(rows[1].components[0].options).toHaveLength(2);
    const playerControl = rows[1].components[0];
    access.setOrganizer(eventId, null);
    step(f, playerControl.custom_id, 'string', [playerControl.options[0].value]);
    await handleTournamentMenu(f.bot, f.i);
    expect(f.i.update).not.toHaveBeenCalled();
  });
});

describe('private menu boundaries and medal settings', () => {
  it.each(['wrong-user', 'wrong-server', 'public', 'expired'])(
    'rejects %s sessions',
    async (mode) => {
      const f = fixture();
      const store = new PrivateMenuSessions<{}>();
      const session = store.create(f.i, {});
      f.i.customId = `example:save:${session.id}`;
      if (mode === 'wrong-user') f.i.user = { id: target };
      if (mode === 'wrong-server') f.i.guildId = 'foreign';
      if (mode === 'public') f.i.message.flags.has = () => false;
      if (mode === 'expired') session.expires = Date.now() - 1;
      expect(await store.resolve(f.i)).toBeNull();
    },
  );
  it('puts medal controls in GenEvo Replay Ratings only', () => {
    const f = fixture();
    expect(JSON.stringify(buildActivityAdminView(f.guild, actor, 'ratings'))).toContain(
      'Medal Settings',
    );
    expect(
      JSON.stringify(
        replayLibraryView({ guildId: f.guildId, channelId: f.channelId, member: f.member }),
      ),
    ).not.toContain('Medal Settings');
  });
});
