import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Collection } from 'discord.js';
import { connectDatabase } from '../../src/database/connection';
import { db } from '../../src/database/sqlite';
import { guildRepository } from '../../src/repositories/guild.repository';
import { tournamentRepository as events } from '../../src/repositories/tournament.repository';
import { tournamentAccessRepository as access } from '../../src/repositories/tournament-access.repository';
import { clanRepository as clans, ClanRepository } from '../../src/repositories/clan.repository';
import { userRepository } from '../../src/repositories/user.repository';
import { masterRepository } from '../../src/repositories/master.repository';
import { execute as editEvent } from '../../src/interactions/modals/tournament-edit.modal';
import { execute as checkin } from '../../src/interactions/buttons/checkin.button';
import { execute as reportScore } from '../../src/commands/tournaments/report-score.command';
import { execute as reviewScore } from '../../src/interactions/buttons/score-review.button';
import { execute as profile } from '../../src/commands/admin/profile-admin.command';
import { execute as addMaster } from '../../src/commands/admin/add-master.command';
import { execute as removeMaster } from '../../src/commands/admin/remove-master.command';
import { execute as editClan } from '../../src/interactions/modals/clan-manager-edit.modal';
import { execute as createClan } from '../../src/interactions/modals/clan-create.modal';
import { execute as associate } from '../../src/commands/admin/tournament-participant.command';
import { execute as organizer } from '../../src/commands/admin/tournament-organizer.command';
import { challongeService } from '../../src/services/challonge.service';
import { canManageTournament } from '../../src/utils/tournament-access';
import { up as migration } from '../../src/database/migrations/037_security_boundaries';

const guildId = '111111111111111111',
  otherGuild = '222222222222222222';
const userId = '333333333333333333',
  otherUser = '444444444444444444',
  owner = '123456789012345678';
beforeAll(connectDatabase);
beforeEach(() => {
  vi.restoreAllMocks();
  db.exec(
    'DELETE FROM tournament_matches; DELETE FROM tournament_participants; DELETE FROM tournament_events; DELETE FROM app_settings; DELETE FROM clans;',
  );
  guildRepository.upsert(guildId, { game: 'ra3', clansEnabled: 1 });
  guildRepository.upsert(otherGuild, { game: 'ra3', clansEnabled: 1 });
  vi.spyOn(challongeService, 'updateMatchScore').mockResolvedValue(undefined);
  vi.spyOn(challongeService, 'getMatches').mockResolvedValue([
    { id: 7, tournamentId: 1, state: 'open', player1Id: 10, player2Id: 20 },
  ] as any);
});
function fixture(guild = guildId, user = userId, staff = true) {
  const member: any = {
    id: user,
    guild: { id: guild, ownerId: 'other' },
    permissions: { has: () => staff },
    roles: { cache: new Collection() },
  };
  const g: any = {
    id: guild,
    ownerId: 'other',
    members: { fetch: vi.fn().mockResolvedValue(member) },
    channels: { cache: new Collection() },
    roles: { cache: new Collection() },
  };
  const opts: Record<string, any> = {};
  const fields: Record<string, string> = {};
  const i: any = {
    guild: g,
    guildId: guild,
    member,
    user: { id: user, username: 'Victim', bot: false },
    options: {
      getString: (k: string) => opts[k] ?? null,
      getInteger: (k: string) => opts[k],
      getBoolean: (k: string) => opts[k],
      getUser: (k: string) => opts[k],
      getSubcommand: () => opts.action,
    },
    fields: { getTextInputValue: (k: string) => fields[k] ?? '' },
    customId: '',
    message: { embeds: [] },
    reply: vi.fn(),
    followUp: vi.fn(),
    update: vi.fn(),
    editReply: vi.fn(),
    deferUpdate: vi.fn(),
    deferReply: vi.fn(),
    inCachedGuild: () => true,
    isFromMessage: () => false,
  };
  const bot: any = { client: { guilds: { cache: new Collection([[guild, g]]) } } };
  return { i, bot, g, member, opts, fields };
}
function event() {
  const id = events.createEvent({
    game: 'ra3',
    eventUrl: 'https://example.com/cup',
    title: 'Test Cup',
    announcedAt: new Date().toISOString(),
    startDate: '1 Jan 2099',
  });
  events.setEventStatus(id, 'registration');
  access.setOrganizer(id, guildId);
  return id;
}
function score(eventId: number, source: string | undefined = guildId) {
  events.setEventChallongeUrl(eventId, 'https://challonge.com/testcup');
  access.authorizeBracket(eventId, '1', guildId, 'testcup');
  events.addParticipant(eventId, 'Reporter', 'discord', userId);
  events.addParticipant(eventId, 'Opponent', 'discord', otherUser);
  const reporter = events.findParticipantByDiscord(eventId, userId)!;
  const opponent = events.findParticipantByDiscord(eventId, otherUser)!;
  events.linkParticipantDiscord(eventId, reporter.id, userId, {
    tournamentId: '1',
    participantId: '10',
  });
  events.linkParticipantDiscord(eventId, opponent.id, otherUser, {
    tournamentId: '1',
    participantId: '20',
  });
  return events.insertMatch({
    guildId: source,
    eventId,
    tournamentId: '1',
    reporterParticipantId: reporter.id,
    opponentParticipantId: opponent.id,
    challongeMatchId: '7',
    player1Id: '10',
    player2Id: '20',
    player1Score: 2,
    player2Score: 1,
    winnerId: '10',
    reportedBy: userId,
    proofUrl: null,
  });
}
function clan(ownerId = userId, tag = 'TST') {
  return { name: `Clan ${tag}`, tag, ownerId, guildId, approved: 0, maxMembers: 50, isPrivate: 0 };
}

describe('shared write authorization', () => {
  it('blocks a different guild admin from shared tournament edits, but permits organizer staff', async () => {
    const id = event();
    const attacker = fixture(otherGuild);
    attacker.i.customId = `tournament_edit_modal_${id}`;
    attacker.fields.prize = '999 USD';
    await editEvent(attacker.bot, attacker.i);
    expect(events.getEventDetail(id)?.prizePool).not.toBe('999 USD');
    const trusted = fixture();
    trusted.i.customId = attacker.i.customId;
    trusted.fields.prize = '250 USD';
    await editEvent(trusted.bot, trusted.i);
    expect(events.getEventDetail(id)?.prizePool).toBe('250 USD');
    expect(trusted.g.members.fetch).toHaveBeenCalledWith({ user: userId, force: true });
  });
  it('only the bot owner can assign or revoke organizers', async () => {
    const id = event(),
      admin = fixture();
    admin.opts.event = id;
    admin.opts.server = otherGuild;
    await organizer(admin.bot, admin.i);
    expect(access.organizer(id)).toBe(guildId);
    const trusted = fixture(guildId, owner);
    trusted.opts.event = id;
    await organizer(trusted.bot, trusted.i);
    expect(access.organizer(id)).toBeUndefined();
    expect(canManageTournament(admin.member, id)).toBe(false);
  });
  it('rejects cross-guild, old-origin, revoked-role and revoked-organizer score review without provider writes', async () => {
    const id = event();
    const reportId = score(id);
    for (const mode of ['cross', 'role', 'organizer', 'old']) {
      access.setOrganizer(id, guildId);
      const f = fixture(mode === 'cross' ? otherGuild : guildId, userId, mode !== 'role');
      const r = mode === 'old' ? score(id, undefined) : reportId;
      if (mode === 'old')
        db.prepare('UPDATE tournament_matches SET guild_id=NULL WHERE id=?').run(r);
      if (mode === 'organizer') access.setOrganizer(id, otherGuild);
      f.i.customId = `score_review_approve_${r}_${f.i.guildId}`;
      await reviewScore(f.bot, f.i);
      expect(events.getMatchReport(r)?.status).toBe('pending');
    }
    expect(challongeService.updateMatchScore).not.toHaveBeenCalled();
  });
  it('permits a legitimate DM review and claims a pending report before a concurrent remote write', async () => {
    const id = event(),
      report = score(id);
    const f = fixture();
    f.i.guild = null;
    f.i.guildId = null;
    f.i.customId = `score_review_approve_${report}_${guildId}`;
    await Promise.all([reviewScore(f.bot, f.i), reviewScore(f.bot, f.i)]);
    expect(events.getMatchReport(report)?.status).toBe('approved');
    expect(challongeService.updateMatchScore).toHaveBeenCalledExactlyOnceWith('1', 7, '2-1', 10);
  });
  it.each(['complete', 'wrong-player', 'wrong-bracket'])(
    'does not sync a stale %s match',
    async (mode) => {
      const id = event(),
        report = score(id),
        f = fixture();
      if (mode === 'complete')
        vi.mocked(challongeService.getMatches).mockResolvedValue([
          { id: 7, state: 'complete', player1Id: 10, player2Id: 20 },
        ] as any);
      if (mode === 'wrong-player')
        vi.mocked(challongeService.getMatches).mockResolvedValue([
          { id: 7, state: 'open', player1Id: 10, player2Id: 30 },
        ] as any);
      if (mode === 'wrong-bracket') access.setOrganizer(id, null);
      f.i.customId = `score_review_approve_${report}_${guildId}`;
      await reviewScore(f.bot, f.i);
      expect(challongeService.updateMatchScore).not.toHaveBeenCalled();
    },
  );
  it('keeps profile mutations with their owner or bot owner, preserving admin viewing policy', async () => {
    userRepository.linkRa3BattleNet(otherUser, 'Victim', 42);
    const f = fixture();
    f.opts.action = 'unlink';
    f.opts.user = { id: otherUser, displayName: 'Victim' };
    f.opts.platform = 'ra3b';
    await profile(f.bot, f.i);
    expect(userRepository.findByDiscordId(otherUser)?.ra3bUsername).toBe('Victim');
    f.opts.action = 'clear';
    f.opts.confirm = true;
    await profile(f.bot, f.i);
    expect(userRepository.findByDiscordId(otherUser)?.ra3bUsername).toBe('Victim');
    const trusted = fixture(guildId, owner);
    trusted.opts.action = 'unlink';
    trusted.opts.user = f.opts.user;
    trusted.opts.platform = 'ra3b';
    await profile(trusted.bot, trusted.i);
    expect(userRepository.findByDiscordId(otherUser)?.ra3bUsername).toBeFalsy();
  });
  it('rejects local-admin Masters writes but preserves bot-owner curation and public reads', async () => {
    const f = fixture();
    f.opts.name = 'Security Test Master';
    f.opts.year = 2026;
    await addMaster(f.bot, f.i);
    expect(masterRepository.findByName(f.opts.name, 'ra3')).toBeUndefined();
    const trusted = fixture(guildId, owner);
    Object.assign(trusted.opts, f.opts);
    await addMaster(trusted.bot, trusted.i);
    expect(masterRepository.findByName(f.opts.name, 'ra3')).toBeDefined();
    await removeMaster(f.bot, f.i);
    expect(masterRepository.findByName(f.opts.name, 'ra3')).toBeDefined();
    await removeMaster(trusted.bot, trusted.i);
    expect(masterRepository.findByName(f.opts.name, 'ra3')).toBeUndefined();
  });
});
describe('participant identity', () => {
  it.each(['yes', 'no'])('cannot claim an imported name through check-in %s', async (action) => {
    const id = event();
    events.addParticipant(id, 'Victim', 'forum');
    const f = fixture(guildId, userId, false);
    f.i.customId = `checkin_${action}_${id}`;
    await checkin(f.bot, f.i);
    expect(events.getParticipants(id)[0].discordId).toBeUndefined();
    expect(events.getParticipants(id)[0].checkedIn).toBe(0);
  });
  it('does not authenticate report-score using a matching nickname or self-declared profile', async () => {
    const id = event();
    events.addParticipant(id, 'Victim', 'forum');
    events.setCheckedIn(id, 'Victim', true);
    userRepository.linkRa3BattleNet(userId, 'Victim', 42);
    const f = fixture(guildId, userId, false);
    await reportScore(f.bot, f.i);
    expect(events.findParticipantByDiscord(id, userId)).toBeUndefined();
    expect(db.prepare('SELECT COUNT(*) as n FROM tournament_matches').get()).toEqual({ n: 0 });
  });
  it('supports organizer-approved associations and rejects cross-guild association attempts', async () => {
    const id = event();
    events.addParticipant(id, 'Victim', 'forum');
    const attacker = fixture(otherGuild);
    attacker.opts.event = id;
    attacker.opts.player = 'Victim';
    attacker.opts.user = attacker.i.user;
    await associate(attacker.bot, attacker.i);
    expect(events.findParticipantByDiscord(id, userId)).toBeUndefined();
    const f = fixture();
    f.opts.event = id;
    f.opts.player = 'Victim';
    f.opts.user = f.i.user;
    await associate(f.bot, f.i);
    expect(events.findParticipantByDiscord(id, userId)?.bindingVerified).toBe(true);
    f.i.customId = `checkin_yes_${id}_player`;
    await checkin(f.bot, f.i);
    expect(events.findParticipantByDiscord(id, userId)?.checkedIn).toBe(1);
  });
  it('preserves fresh self-registration, exact identity precedence, and unique bindings', async () => {
    const id = event();
    const f = fixture(guildId, userId, false);
    f.i.user.username = 'New Player';
    f.i.customId = `checkin_yes_${id}_player`;
    await checkin(f.bot, f.i);
    expect(events.findParticipantByDiscord(id, userId)?.checkedIn).toBe(1);
    events.addParticipant(id, 'Victim', 'forum');
    f.i.member.displayName = 'Victim';
    await checkin(f.bot, f.i);
    expect(events.getParticipants(id).find((p) => p.name === 'Victim')?.discordId).toBeUndefined();
    expect(
      events.linkParticipantDiscord(
        id,
        events.getParticipants(id).find((p) => p.name === 'Victim')!.id,
        userId,
      ),
    ).toBe(false);
  });
  it('legacy imported bindings need re-verification without deleting registrations', () => {
    const id = event();
    events.addParticipant(id, 'Victim', 'forum', userId);
    migration();
    expect(events.findParticipantByDiscord(id, userId)).toBeUndefined();
    expect(events.setCheckedInByDiscord(id, userId, true)).toBe(false);
    expect(events.getParticipants(id)).toHaveLength(1);
  });
});
describe('clan authorization and admission', () => {
  it('rejects revoked roles, stolen modal bindings, legacy scopes and invalid fields without partial edits', async () => {
    const id = clans.create(clan()),
      f = fixture();
    f.fields.description = 'Changed';
    f.fields.maxMembers = '101';
    f.i.customId = `clanmgr_edit_modal_${id}_${guildId}_${userId}`;
    await editClan(f.bot, f.i);
    expect(clans.findById(id)?.description).toBeUndefined();
    f.fields.maxMembers = '10';
    f.member.permissions.has = () => false;
    await editClan(f.bot, f.i);
    expect(clans.findById(id)?.maxMembers).toBe(50);
    f.member.permissions.has = () => true;
    f.i.customId = `clanmgr_edit_modal_${id}_${guildId}_${otherUser}`;
    await editClan(f.bot, f.i);
    expect(clans.findById(id)?.maxMembers).toBe(50);
    f.i.customId = `clanmgr_edit_modal_${id}_${guildId}_${userId}`;
    await editClan(f.bot, f.i);
    expect(clans.findById(id)).toMatchObject({ description: 'Changed', maxMembers: 10 });
    db.prepare('UPDATE clans SET guild_id=NULL WHERE id=?').run(id);
    f.fields.description = 'Legacy change';
    await editClan(f.bot, f.i);
    expect(clans.findById(id)?.description).toBe('Changed');
    const trusted = fixture(guildId, owner);
    trusted.i.customId = `clanmgr_edit_modal_${id}_${guildId}_${owner}`;
    trusted.fields.description = 'Owner-maintained legacy';
    trusted.fields.maxMembers = '20';
    await editClan(trusted.bot, trusted.i);
    expect(clans.findById(id)).toMatchObject({
      description: 'Owner-maintained legacy',
      maxMembers: 20,
    });
  });
  it('limits pending submissions atomically and keeps quotas after rejection and repository restart', () => {
    const now = 1800000000000;
    const id = clans.submit(clan(), now);
    expect(() => clans.submit(clan(userId, 'TWO'), now)).toThrow('pending');
    clans.rejectClan(id);
    for (const tag of ['TWO', 'THREE']) {
      const id = new ClanRepository().submit(clan(userId, tag), now);
      clans.rejectClan(id);
    }
    expect(() => new ClanRepository().submit(clan(userId, 'FOUR'), now)).toThrow('three');
    expect(clans.submit(clan(userId, 'FOUR'), now + 86400001)).toBeGreaterThan(0);
    expect(clans.submit(clan(otherUser, 'FIVE'), now)).toBeGreaterThan(0);
  });
  it('bounds notification claims per guild durably', () => {
    const now = 1800000000000;
    expect(clans.claimApprovalNotification(guildId, now)).toBe(true);
    expect(new ClanRepository().claimApprovalNotification(guildId, now + 1000)).toBe(false);
    expect(clans.claimApprovalNotification(otherGuild, now + 1000)).toBe(true);
    expect(clans.claimApprovalNotification(guildId, now + 600001)).toBe(true);
  });
  it('rechecks feature state and sends only one selected-channel notice, never administrator DMs', async () => {
    const f = fixture();
    f.fields.name = 'New Clan';
    f.fields.tag = 'NEW';
    const send = vi.fn().mockResolvedValue(undefined),
      dm = vi.fn().mockResolvedValue(undefined);
    f.g.channels.cache.set('approval', { isTextBased: () => true, send });
    f.g.roles.cache.set('admin', { members: new Collection([['admin', { send: dm }]]) });
    guildRepository.upsert(guildId, {
      clanChannelId: 'approval',
      adminRoleId: 'admin',
      clansEnabled: 0,
    });
    await createClan(f.bot, f.i);
    expect(clans.findPending(guildId)).toHaveLength(0);
    guildRepository.toggleFeature(guildId, 'clans', true);
    await createClan(f.bot, f.i);
    await createClan(f.bot, f.i);
    expect(clans.findPending(guildId)).toHaveLength(1);
    expect(send).toHaveBeenCalledOnce();
    expect(dm).not.toHaveBeenCalled();
    expect(f.i.deferReply).toHaveBeenCalledWith({ ephemeral: true });
  });
});
