import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Collection } from 'discord.js';
import { connectDatabase } from '../../src/database/connection';
import { db } from '../../src/database/sqlite';
import { tournamentRepository as events } from '../../src/repositories/tournament.repository';
import { tournamentAccessRepository as access } from '../../src/repositories/tournament-access.repository';
import { clanRepository as clans } from '../../src/repositories/clan.repository';
import { guildRepository } from '../../src/repositories/guild.repository';
import { userRepository as users } from '../../src/repositories/user.repository';
import { challongeService as provider } from '../../src/services/challonge.service';
import {
  CheckinNotificationService,
  checkinNotificationService,
} from '../../src/services/checkin-notification.service';
import { execute as link } from '../../src/interactions/modals/tournament-link.modal';
import { execute as associate } from '../../src/commands/admin/tournament-participant.command';
import { execute as report } from '../../src/commands/tournaments/report-score.command';
import { execute as review } from '../../src/interactions/buttons/score-review.button';
import { execute as checkin } from '../../src/interactions/buttons/checkin.button';
import { execute as approveClan } from '../../src/interactions/buttons/approve-clan.button';
import { execute as rejectClan } from '../../src/interactions/buttons/reject-clan.button';
import { execute as deleteClan } from '../../src/interactions/buttons/clan-confirm-delete.button';
import { tournamentPlayerKey } from '../../src/utils/tournament-player-name';

const guildId = '111111111111111111',
  otherGuild = '222222222222222222';
const userId = '333333333333333333',
  opponentId = '444444444444444444';
const owner = '123456789012345678',
  refId = '555555555555555555';
beforeAll(connectDatabase);
beforeEach(() => {
  vi.restoreAllMocks();
  db.exec(
    'DELETE FROM tournament_matches; DELETE FROM tournament_participants; DELETE FROM tournament_events; DELETE FROM app_settings; DELETE FROM clans; DELETE FROM users;',
  );
  for (const id of [guildId, otherGuild])
    guildRepository.upsert(id, { game: 'ra3', tournamentsEnabled: 1, refereeRoleId: refId });
  vi.spyOn(provider, 'getTournament').mockResolvedValue({
    id: 123,
    name: 'Test Cup',
    state: 'pending',
  });
  vi.spyOn(provider, 'getParticipants').mockResolvedValue([
    { id: 10, name: 'Élite', tournamentId: 123 },
    { id: 20, name: 'Opponent', tournamentId: 123 },
  ]);
  vi.spyOn(provider, 'getMatches').mockResolvedValue([
    { id: 7, tournamentId: 123, state: 'open', player1Id: 10, player2Id: 20 },
  ]);
  vi.spyOn(provider, 'updateMatchScore').mockResolvedValue(undefined);
});
function event(title = 'Test Cup', url = 'https://example.com/test') {
  const id = events.createEvent({
    game: 'ra3',
    eventUrl: url,
    title,
    announcedAt: new Date().toISOString(),
    startDate: '1 Jan 2099',
  });
  events.setEventStatus(id, 'registration');
  access.setOrganizer(id, guildId);
  return id;
}
function fixture(guild = guildId, user = userId) {
  const member: any = {
    id: user,
    user: { bot: false },
    displayName: 'Élite',
    guild: { id: guild },
    permissions: { has: () => true },
    roles: { cache: new Collection() },
  };
  const g: any = {
    id: guild,
    members: { fetch: vi.fn().mockResolvedValue(member) },
    roles: { cache: new Collection(), create: vi.fn() },
    channels: { cache: new Collection(), create: vi.fn() },
  };
  const fields: Record<string, string> = {},
    opts: Record<string, any> = {};
  const i: any = {
    guild: g,
    guildId: guild,
    member,
    user: { id: user, username: 'Élite', bot: false },
    message: { embeds: [] },
    customId: '',
    fields: { getTextInputValue: (k: string) => fields[k] ?? '' },
    options: {
      getInteger: (k: string) => opts[k],
      getUser: (k: string) => opts[k],
      getString: (k: string) => opts[k],
    },
    reply: vi.fn(),
    editReply: vi.fn(),
    followUp: vi.fn(),
    update: vi.fn(),
    deferReply: vi.fn(),
    deferUpdate: vi.fn(),
    inCachedGuild: () => true,
  };
  return {
    i,
    g,
    member,
    fields,
    opts,
    bot: {
      client: {
        guilds: { cache: new Collection([[guild, g]]) },
        users: { fetch: vi.fn().mockResolvedValue(null) },
      },
    } as any,
  };
}
function players(id: number, external = true) {
  events.addParticipant(id, 'Élite', 'discord', userId);
  events.addParticipant(id, 'Opponent', 'discord', opponentId);
  const a = events.findParticipantByDiscord(id, userId)!,
    b = events.findParticipantByDiscord(id, opponentId)!;
  if (external) {
    events.linkParticipantDiscord(id, a.id, userId, { tournamentId: '123', participantId: '10' });
    events.linkParticipantDiscord(id, b.id, opponentId, {
      tournamentId: '123',
      participantId: '20',
    });
  }
  events.setCheckedInByDiscord(id, userId, true);
  events.setCheckedInByDiscord(id, opponentId, true);
  return { a, b };
}
function score(id: number, verified = true) {
  const { a, b } = players(id, verified);
  return events.insertMatch({
    eventId: id,
    guildId,
    tournamentId: '123',
    challongeMatchId: '7',
    player1Id: '10',
    player2Id: '20',
    player1Score: 2,
    player2Score: 1,
    winnerId: '10',
    reportedBy: userId,
    proofUrl: null,
    reporterParticipantId: a.id,
    opponentParticipantId: b.id,
  });
}

describe('provider ownership is not a display link or nickname', () => {
  it('detects an uncached numeric alias of a legacy slug attachment', async () => {
    const victim = event('Victim Cup', 'https://example.com/victim'),
      receiver = event();
    events.addBracket(victim, 'https://challonge.com/legacy-slug');
    const f = fixture();
    f.fields.bracket = '123';
    f.fields.event_title = 'Test Cup';
    await link(f.bot, f.i);
    expect(provider.getTournament).toHaveBeenCalledWith('legacy-slug');
    expect(events.getEventDetail(receiver)?.challongeUrl).toBeFalsy();
    expect(events.getBrackets(receiver)).toHaveLength(0);
  });
  it('fails closed when a legacy alias cannot be verified, preserving the local guild link', async () => {
    const victim = event('Victim Cup', 'https://example.com/victim'),
      receiver = event();
    events.addBracket(victim, 'https://challonge.com/legacy-slug');
    vi.mocked(provider.getTournament).mockImplementation(async (ref) => {
      if (ref === 'legacy-slug') throw new Error('Rate limited');
      return { id: 123, name: 'Test Cup', state: 'pending' };
    });
    const f = fixture();
    f.fields.bracket = '123';
    f.fields.event_title = 'Test Cup';
    await link(f.bot, f.i);
    expect(events.getEventDetail(receiver)?.challongeUrl).toBeFalsy();
    expect(events.getLinkedTournamentId(guildId)).toBe('123');
  });
  it.each(['https://challonge.com/victim-cup', 'https://www.challonge.com/en/Victim-Cup', '123'])(
    'does not transfer another event bracket through %s',
    async (raw) => {
      const victim = event('Victim Cup', 'https://example.com/victim'),
        receiver = event();
      events.addBracket(victim, 'https://challonge.com/victim-cup');
      access.authorizeBracket(victim, '123', guildId, 'victim-cup');
      const f = fixture();
      f.fields.bracket = raw;
      f.fields.event_title = 'Test Cup';
      await link(f.bot, f.i);
      expect(events.getEventDetail(receiver)?.challongeUrl).toBeFalsy();
      expect(events.getBrackets(receiver)).toHaveLength(0);
      expect(access.writableBracket(receiver, '123')).toBeUndefined();
    },
  );
  it('permits owner-confirmed relinking and more than one bracket for the same event', async () => {
    const id = event(),
      f = fixture(guildId, owner);
    f.fields.bracket = 'testcup';
    f.fields.event_title = 'Test Cup';
    await link(f.bot, f.i);
    await link(f.bot, f.i);
    expect(events.getBrackets(id)).toHaveLength(1);
    expect(access.writableBracket(id, 'testcup')).toBe('123');
    expect(access.authorizeBracket(id, '124', guildId, 'testcup-finals')).toBe(true);
    expect(access.writableBracket(id, '124')).toBe('124');
  });
  it('does not grant shared API writes when organizer staff merely link a bracket', async () => {
    const id = event(),
      f = fixture();
    f.fields.bracket = 'testcup';
    f.fields.event_title = 'Test Cup';
    await link(f.bot, f.i);
    expect(events.getEventDetail(id)?.challongeUrl).toContain('testcup');
    expect(access.writableBracket(id, 'testcup')).toBeUndefined();
  });
  it.each([
    'display-only',
    'self-registration',
    'old-report',
    'revoked-binding',
    'revoked-during-fetch',
  ])('does not sync a %s report', async (mode) => {
    const id = event();
    events.setEventChallongeUrl(id, 'https://challonge.com/testcup');
    if (mode !== 'display-only') access.authorizeBracket(id, '123', guildId, 'testcup');
    const reportId = score(id, mode !== 'self-registration');
    if (mode === 'old-report')
      db.prepare('UPDATE tournament_matches SET reporter_participant_id=NULL WHERE id=?').run(
        reportId,
      );
    if (mode === 'revoked-binding')
      events.linkParticipantDiscord(id, events.findParticipantByDiscord(id, userId)!.id, userId);
    if (mode === 'revoked-during-fetch')
      vi.mocked(provider.getMatches).mockImplementation(async () => {
        events.linkParticipantDiscord(id, events.findParticipantByDiscord(id, userId)!.id, userId);
        return [{ id: 7, tournamentId: 123, state: 'open', player1Id: 10, player2Id: 20 }];
      });
    const f = fixture();
    f.i.customId = `score_review_approve_${reportId}_${guildId}`;
    await review(f.bot, f.i);
    expect(provider.updateMatchScore).not.toHaveBeenCalled();
    expect(events.getMatchReport(reportId)?.status).toBe('approved');
  });
  it('preserves authorized remote score approval with pinned participants', async () => {
    const id = event();
    access.authorizeBracket(id, '123', guildId, 'testcup');
    const reportId = score(id),
      f = fixture();
    f.i.customId = `score_review_approve_${reportId}_${guildId}`;
    await review(f.bot, f.i);
    expect(provider.updateMatchScore).toHaveBeenCalledExactlyOnceWith('123', 7, '2-1', 10);
  });
  it('self-registering before provider ingestion still permits only a local score report', async () => {
    const id = event();
    events.setEventChallongeUrl(id, 'https://challonge.com/testcup');
    access.authorizeBracket(id, '123', guildId, 'testcup');
    players(id, false);
    const f = fixture();
    Object.assign(f.opts, { opponent: 'Opponent', factions: 'AvA', score: '2-1' });
    await report(f.bot, f.i);
    const row = db.prepare('SELECT challonge_match_id FROM tournament_matches').get() as any;
    expect(row.challonge_match_id).toMatch(/^local-/);
    expect(provider.getParticipants).not.toHaveBeenCalled();
  });
  it('organizer verification pins the exact external participant, not just a matching nickname', async () => {
    const id = event();
    events.setEventChallongeUrl(id, 'https://challonge.com/testcup');
    access.authorizeBracket(id, '123', guildId, 'testcup');
    events.addParticipant(id, 'Élite', 'forum');
    const f = fixture();
    Object.assign(f.opts, { event: id, user: { id: userId, bot: false }, player: 'élite' });
    await associate(f.bot, f.i);
    expect(events.findParticipantByDiscord(id, userId)).toMatchObject({
      externalTournamentId: '123',
      externalParticipantId: '10',
    });
  });
  it('lets organizer staff correct a squatted registration while revoking the old account and readiness', async () => {
    const id = event();
    events.addParticipant(id, 'Élite', 'discord', opponentId);
    events.setCheckedInByDiscord(id, opponentId, true);
    const f = fixture();
    Object.assign(f.opts, { event: id, user: { id: userId, bot: false }, player: 'Élite' });
    await associate(f.bot, f.i);
    expect(events.findParticipantByDiscord(id, opponentId)).toBeUndefined();
    expect(events.findParticipantByDiscord(id, userId)).toMatchObject({
      name: 'Élite',
      checkedIn: 0,
    });
    expect(events.setCheckedInByDiscord(id, opponentId, true)).toBe(false);
  });
  it('selects this organizer tournament even when another server has a newer active event', async () => {
    const own = event('Older Cup', 'https://example.com/own');
    players(own, false);
    const other = event('Newer Cup', 'https://example.com/other');
    access.setOrganizer(other, otherGuild);
    db.prepare('UPDATE tournament_events SET start_date=? WHERE id=?').run('1 Jan 2100', other);
    const f = fixture();
    Object.assign(f.opts, { opponent: 'Opponent', factions: 'AvA', score: '2-1' });
    await report(f.bot, f.i);
    expect(db.prepare('SELECT event_id FROM tournament_matches').get()).toEqual({ event_id: own });
  });
});

describe('one consistent player name boundary', () => {
  it.each([
    ['Élite', 'élite'],
    ['élite', 'Élite'],
    ['Élite', 'E\u0301lite'],
    ['Elite', 'Ｅｌｉｔｅ'],
    ['Elite', ' Elite '],
  ])('rejects duplicate %s / %s', (first, second) => {
    const id = event();
    expect(events.addParticipant(id, first, 'forum')).toBe(true);
    expect(events.addParticipant(id, second, 'discord', userId)).toBe(false);
    expect(events.getParticipants(id)).toHaveLength(1);
  });
  it('rejects controls and overlength rather than truncating into a different identity', () => {
    for (const name of ['Elite\u200b', 'Elite\nX', 'x'.repeat(51)])
      expect(tournamentPlayerKey(name)).toBeUndefined();
  });
  it('does not resolve an ambiguous pre-existing roster by first match', async () => {
    const id = event();
    db.prepare('INSERT INTO tournament_participants(event_id,source,name) VALUES(?,?,?)').run(
      id,
      'forum',
      'Élite',
    );
    db.prepare('INSERT INTO tournament_participants(event_id,source,name) VALUES(?,?,?)').run(
      id,
      'forum',
      'élite',
    );
    expect(events.setCheckedIn(id, 'élite', true)).toBe(false);
    const f = fixture();
    Object.assign(f.opts, { event: id, user: { id: userId }, player: 'élite' });
    await associate(f.bot, f.i);
    expect(events.findParticipantByDiscord(id, userId)).toBeUndefined();
  });
});

describe('legacy clans do not belong to arbitrary guilds', () => {
  it('preserves deletion by the legacy leader but rejects an unrelated admin', async () => {
    const id = clans.create({
      name: 'Legacy',
      tag: 'OLD',
      ownerId: userId,
      approved: 1,
      maxMembers: 20,
      isPrivate: 0,
    });
    const attacker = fixture(otherGuild, opponentId);
    attacker.i.customId = `clan_confirm_delete_${id}`;
    await deleteClan(attacker.bot, attacker.i);
    expect(clans.findById(id)).toBeDefined();
    const leader = fixture();
    leader.i.customId = attacker.i.customId;
    await deleteClan(leader.bot, leader.i);
    expect(clans.findById(id)).toBeUndefined();
  });
  it.each(['guild', 'dm'])(
    'blocks unassigned approval and rejection from %s controls before effects',
    async (mode) => {
      const id = clans.create({
        name: 'Legacy',
        tag: 'OLD',
        ownerId: userId,
        approved: 0,
        maxMembers: 20,
        isPrivate: 0,
      });
      const f = fixture(otherGuild);
      f.bot.client.guilds.fetch = vi.fn().mockResolvedValue(f.g);
      if (mode === 'dm') {
        f.i.guild = null;
        f.i.guildId = null;
      }
      for (const handler of [approveClan, rejectClan]) {
        f.i.customId = `${handler === approveClan ? 'approve' : 'reject'}_clan_${id}_${otherGuild}`;
        await handler(f.bot, f.i);
      }
      expect(f.g.roles.create).not.toHaveBeenCalled();
      expect(f.g.channels.create).not.toHaveBeenCalled();
      expect(clans.findById(id)?.approved).toBe(0);
      expect(clans.findPending(otherGuild)).toHaveLength(0);
    },
  );
  it('still lists and rejects a pending clan in its own guild', async () => {
    const id = clans.create({
      name: 'Local',
      tag: 'LOC',
      guildId,
      ownerId: userId,
      approved: 0,
      maxMembers: 20,
      isPrivate: 0,
    });
    expect(clans.findPending(guildId)).toHaveLength(1);
    expect(clans.findById(id, otherGuild)).toBeUndefined();
    const f = fixture();
    f.i.customId = `reject_clan_${id}`;
    await rejectClan(f.bot, f.i);
    expect(clans.findById(id)).toBeUndefined();
  });
});

describe('check-in state changes and bounded organizer-only opt-in alerts', () => {
  it('no-op clicks refresh the board without notifying again', async () => {
    const id = event(),
      f = fixture();
    const notify = vi.spyOn(checkinNotificationService, 'notify').mockResolvedValue(0);
    f.i.customId = `checkin_yes_${id}_player`;
    await checkin(f.bot, f.i);
    await checkin(f.bot, f.i);
    expect(f.i.update).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledTimes(1);
    f.i.customId = `checkin_no_${id}_player`;
    await checkin(f.bot, f.i);
    await checkin(f.bot, f.i);
    expect(notify).toHaveBeenCalledTimes(2);
    expect(events.setCheckedInByDiscord(id, userId, false)).toBe(false);
  });
  it('limits delivery to opted-in organizer referees and suppresses toggles across service restarts', async () => {
    const id = event();
    const a = fixture(),
      b = fixture(otherGuild);
    const referee = (id: string) => ({
      id,
      user: { bot: false },
      roles: { cache: new Collection([[refId, {}]]) },
      send: vi.fn().mockResolvedValue(undefined),
    });
    const opted = referee(userId),
      unknown = referee(opponentId),
      unrelated = referee('666666666666666666');
    users.setRefereeCheckinDmEnabled(opted.id, true);
    users.setRefereeCheckinDmEnabled(unrelated.id, true);
    a.g.members.fetch.mockResolvedValue(new Collection());
    b.g.members.fetch.mockResolvedValue(new Collection());
    a.g.roles.cache.set(refId, {
      members: new Collection([
        [opted.id, opted],
        [unknown.id, unknown],
      ]),
    });
    b.g.roles.cache.set(refId, { members: new Collection([[unrelated.id, unrelated]]) });
    const client = {
      guilds: {
        cache: new Collection([
          [guildId, a.g],
          [otherGuild, b.g],
        ]),
      },
    } as any;
    const service = new CheckinNotificationService();
    service.setClient(client);
    expect(await service.notify(id, 'checked_in', ['Élite'])).toBe(1);
    const restarted = new CheckinNotificationService();
    restarted.setClient(client);
    expect(await restarted.notify(id, 'cancelled', ['élite'])).toBe(0);
    expect(opted.send).toHaveBeenCalledTimes(1);
    expect(unknown.send).not.toHaveBeenCalled();
    expect(unrelated.send).not.toHaveBeenCalled();
    expect(b.g.members.fetch).not.toHaveBeenCalled();
    access.setOrganizer(id, null);
    expect(await restarted.notify(id, 'registered', ['Someone'])).toBe(0);
  });
  it('enforces per-event bursts and preserves a genuine later state change', () => {
    const id = event(),
      now = Date.now();
    expect(
      access.claimCheckinAlerts(
        id,
        Array.from({ length: 40 }, (_, i) => `Player${i}`),
        now,
      ),
    ).toHaveLength(20);
    expect(access.claimCheckinAlerts(id, ['New player'], now + 1)).toHaveLength(0);
    expect(access.claimCheckinAlerts(id, ['Player0'], now + 600001)).toEqual(['Player0']);
  });
  it('bounds failed DM attempts instead of retrying every opted-in referee', async () => {
    const id = event(),
      f = fixture();
    const send = vi.fn().mockRejectedValue(new Error('DMs closed'));
    const refs = new Collection<string, any>();
    for (let n = 0; n < 20; n++) {
      const user = String(700000000000000000n + BigInt(n));
      users.setRefereeCheckinDmEnabled(user, true);
      refs.set(user, {
        id: user,
        user: { bot: false },
        roles: { cache: new Collection([[refId, {}]]) },
        send,
      });
    }
    f.g.members.fetch.mockResolvedValue(new Collection());
    f.g.roles.cache.set(refId, { members: refs });
    const service = new CheckinNotificationService();
    service.setClient(f.bot.client);
    expect(await service.notify(id, 'registered', ['Player'])).toBe(0);
    expect(send).toHaveBeenCalledTimes(10);
  });
  it('new users stay opted out even though the historical schema default was on', () => {
    users.upsertFromMember(userId, 'Someone');
    expect(users.isRefereeCheckinDmEnabled(userId)).toBe(false);
    users.setLanguage(opponentId, 'en');
    expect(users.isRefereeCheckinDmEnabled(opponentId)).toBe(false);
  });
});
