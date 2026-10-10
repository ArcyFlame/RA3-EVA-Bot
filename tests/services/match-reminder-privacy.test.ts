import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Collection } from 'discord.js';
import { connectDatabase } from '../../src/database/connection';
import { db } from '../../src/database/sqlite';
import { guildRepository } from '../../src/repositories/guild.repository';
import { userRepository } from '../../src/repositories/user.repository';
import { tournamentRepository as repo } from '../../src/repositories/tournament.repository';
import { challongeService } from '../../src/services/challonge.service';
import {
  MatchReminderService,
  resolveReminderMember,
} from '../../src/services/match-reminder.service';
import {
  authorizeReminderControl,
  parseReminderControl,
} from '../../src/utils/match-reminder-controls';
import { execute as confirm } from '../../src/interactions/buttons/confirm-match.button';
import { execute as delayButton } from '../../src/interactions/buttons/delay-match.button';
import { execute as delayModal } from '../../src/interactions/modals/delay.modal';
import { execute as join } from '../../src/events/guildCreate';

beforeAll(connectDatabase);
beforeEach(() => {
  vi.restoreAllMocks();
  db.exec(
    'DELETE FROM tournament_match_confirmations; DELETE FROM tournament_cache; DELETE FROM guilds; DELETE FROM users;',
  );
});

function fixture(count = 2, id = 'server') {
  guildRepository.upsert(id, { tournamentsEnabled: 1 });
  repo.linkTournament(id, 'bracket', 'https://challonge.com/bracket');
  const members = new Collection<string, any>();
  for (let n = 0; n < count; n++) {
    const uid = 'user-' + n;
    const member = {
      id: uid,
      guild: { id },
      displayName: 'Player-' + n,
      user: { id: uid, username: 'username-' + n, displayName: 'display-' + n, bot: false },
      send: vi.fn().mockResolvedValue(undefined),
    };
    members.set(uid, member);
    userRepository.setTournamentMatchDmEnabled(uid, true);
  }
  const guild: any = {
    id,
    name: 'Test server',
    members: {
      cache: members,
      fetch: vi.fn(async (options?: { user: string }) =>
        options ? members.get(options.user) : members,
      ),
    },
  };
  const outsider = { id: 'outsider', username: 'Player-0', displayName: 'Player-0', send: vi.fn() };
  const client: any = {
    guilds: { cache: new Collection([[id, guild]]) },
    users: { cache: new Collection([['outsider', outsider]]) },
  };
  const scheduledTime = new Date(Date.now() + 5 * 60_000).toISOString();
  const matches = Array.from({ length: Math.floor(count / 2) }, (_, n) => ({
    id: n + 1,
    tournamentId: 123,
    state: 'open' as const,
    player1Id: n * 2 + 1,
    player2Id: n * 2 + 2,
    scheduledTime,
  }));
  const participants = [...members.values()].map((m, n) => ({
    id: n + 1,
    name: m.displayName,
    tournamentId: 123,
  }));
  vi.spyOn(challongeService, 'getMatches').mockResolvedValue(matches);
  vi.spyOn(challongeService, 'getParticipants').mockResolvedValue(participants);
  const service = new MatchReminderService();
  const tick = () => (service as any).checkMatches(client) as Promise<void>;
  const interaction: any = {
    user: { id: 'user-0' },
    guildId: null,
    reply: vi.fn(),
    followUp: vi.fn(),
    editReply: vi.fn(),
    showModal: vi.fn(),
    fields: { getTextInputValue: () => '10' },
    deferReply: vi.fn(async () => {
      interaction.deferred = true;
    }),
  };
  return {
    id,
    guild,
    client,
    members,
    matches,
    participants,
    scheduledTime,
    service,
    tick,
    outsider,
    interaction,
  };
}

describe('match reminder recipients and delivery', () => {
  it('only uses unique human members of the linked server, including guild nicknames', async () => {
    const f = fixture();
    await f.tick();
    expect(f.members.get('user-0').send).toHaveBeenCalledTimes(1);
    expect(f.members.get('user-1').send).toHaveBeenCalledTimes(1);
    expect(f.outsider.send).not.toHaveBeenCalled();
    expect(f.guild.members.fetch).toHaveBeenCalledWith({ user: 'user-0', force: true });
    const row = repo.getMatchReminder(f.id, 'bracket', '1')!;
    expect(row).toMatchObject({ player1Notified: 1, player2Notified: 1, reminderSent: 1 });
    expect(
      f.members.get('user-0').send.mock.calls[0][0].components[0].toJSON().components[0].custom_id,
    ).toBe('confirm_match_v1_' + row.id);
  });

  it('does not send to bots, ambiguous names, departed members or unknown preference rows', async () => {
    for (const mode of ['bot', 'ambiguous', 'departed', 'unknown']) {
      const f = fixture(2, mode);
      if (mode === 'bot') f.members.get('user-0').user.bot = true;
      if (mode === 'ambiguous') f.members.get('user-1').user.displayName = 'Player-0';
      if (mode === 'departed')
        f.guild.members.fetch.mockImplementation(async (options: any) =>
          options ? null : f.members,
        );
      if (mode === 'unknown') db.prepare('DELETE FROM users WHERE discord_id = ?').run('user-0');
      await f.tick();
      expect(f.members.get('user-0').send).not.toHaveBeenCalled();
    }
    const f = fixture();
    expect(resolveReminderMember(f.members.values(), 'missing')).toBeNull();
    expect(resolveReminderMember(f.members.values(), ' PLAYER-0 ')?.id).toBe('user-0');
  });

  it('honors opt-out independently, with no resend if the other player later opts in', async () => {
    const f = fixture();
    userRepository.setTournamentMatchDmEnabled('user-1', false);
    await f.tick();
    expect(f.members.get('user-0').send).toHaveBeenCalledTimes(1);
    expect(f.members.get('user-1').send).not.toHaveBeenCalled();
    userRepository.setTournamentMatchDmEnabled('user-1', true);
    await (new MatchReminderService() as any).checkMatches(f.client);
    expect(f.members.get('user-0').send).toHaveBeenCalledTimes(1);
    expect(f.members.get('user-1').send).toHaveBeenCalledTimes(1);
  });

  it('rechecks opt-out, tournament linkage and enablement after a membership fetch', async () => {
    for (const mode of ['opt-out', 'disabled', 'relinked']) {
      const f = fixture(2, mode);
      f.guild.members.fetch.mockImplementation(async (options: any) => {
        if (!options) return f.members;
        if (mode === 'opt-out') userRepository.setTournamentMatchDmEnabled(options.user, false);
        if (mode === 'disabled') guildRepository.upsert(f.id, { tournamentsEnabled: 0 });
        if (mode === 'relinked')
          repo.linkTournament(f.id, 'different', 'https://challonge.com/different');
        return f.members.get(options.user);
      });
      await f.tick();
      expect(f.members.get('user-0').send).not.toHaveBeenCalled();
      expect(f.members.get('user-1').send).not.toHaveBeenCalled();
    }
  });

  it('rechecks uniqueness if a nickname collision appears during membership lookup', async () => {
    const f = fixture();
    f.guild.members.fetch.mockImplementation(async (options: any) => {
      if (!options) return f.members;
      f.members.get('user-1').user.displayName = 'Player-0';
      return f.members.get(options.user);
    });
    await f.tick();
    expect(f.members.get('user-0').send).not.toHaveBeenCalled();
  });

  it('updates a pending rescheduled match without repeating a delivered reminder', async () => {
    const f = fixture();
    userRepository.setTournamentMatchDmEnabled('user-0', false);
    userRepository.setTournamentMatchDmEnabled('user-1', false);
    await f.tick();
    const old = repo.getMatchReminder(f.id, 'bracket', '1')!;
    f.matches[0].scheduledTime = new Date(Date.now() + 7 * 60_000).toISOString();
    userRepository.setTournamentMatchDmEnabled('user-0', true);
    await f.tick();
    expect(repo.getMatchReminderById(old.id)?.scheduledTime).toBe(f.matches[0].scheduledTime);
    f.matches[0].scheduledTime = new Date(Date.now() + 8 * 60_000).toISOString();
    userRepository.setTournamentMatchDmEnabled('user-1', true);
    await f.tick();
    expect(f.members.get('user-0').send).toHaveBeenCalledTimes(1);
    expect(f.members.get('user-1').send).toHaveBeenCalledTimes(1);
  });

  it('skips disabled guilds, failed member lists, completed/expired/invalid/far-future matches', async () => {
    const f = fixture();
    guildRepository.upsert(f.id, { tournamentsEnabled: 0 });
    await f.tick();
    expect(challongeService.getMatches).not.toHaveBeenCalled();
    guildRepository.upsert(f.id, { tournamentsEnabled: 1 });
    f.guild.members.fetch.mockRejectedValueOnce(new Error('Unavailable'));
    await f.tick();
    expect(f.members.get('user-0').send).not.toHaveBeenCalled();
    for (const patch of [
      { state: 'complete' },
      { scheduledTime: 'invalid' },
      { scheduledTime: new Date(Date.now() - 60_000).toISOString() },
      { scheduledTime: new Date(Date.now() + 30 * 60_000).toISOString() },
    ]) {
      vi.mocked(challongeService.getMatches).mockResolvedValue([
        { ...f.matches[0], ...patch } as any,
      ]);
      await f.tick();
    }
    expect(f.members.get('user-0').send).not.toHaveBeenCalled();
  });

  it('persists context before sending and prevents repeats on partial DM failure and overlapping ticks', async () => {
    const f = fixture();
    f.members.get('user-0').send.mockImplementation(async () => {
      expect(repo.getMatchReminder(f.id, 'bracket', '1')).toBeDefined();
      await f.tick();
      throw new Error('DMs blocked');
    });
    await Promise.all([f.tick(), f.tick(), f.tick()]);
    await (new MatchReminderService() as any).checkMatches(f.client);
    expect(f.members.get('user-0').send).toHaveBeenCalledTimes(1);
    expect(f.members.get('user-1').send).toHaveBeenCalledTimes(1);
  });

  it('simulates 500 members, 250 matches and 20 overlapping ticks without a DM fan-out', async () => {
    const f = fixture(500);
    for (let n = 180; n < 500; n++) userRepository.setTournamentMatchDmEnabled('user-' + n, false);
    await Promise.all(Array.from({ length: 20 }, () => f.tick()));
    await (new MatchReminderService() as any).checkMatches(f.client);
    expect(
      [...f.members.values()].reduce((sum, member) => sum + member.send.mock.calls.length, 0),
    ).toBe(180);
    expect(f.outsider.send).not.toHaveBeenCalled();
    expect(challongeService.getParticipants).toHaveBeenCalledTimes(2);
    expect(f.guild.members.fetch).toHaveBeenCalledTimes(182);
  }, 20_000);
});

describe('persisted reminder controls', () => {
  it('does not poll a verified finished community bracket or permit its remaining controls', async () => {
    const f = fixture();
    const url = 'https://organizer.challonge.com/cup';
    repo.linkTournament(f.id, 'bracket', url);
    repo.saveResultCache(url, { sourceType: 'challonge', tournament: { state: 'complete' } });
    await f.tick();
    expect(challongeService.getMatches).not.toHaveBeenCalled();
    repo.recordMatchReminder(f.id, 'bracket', '7', 'user-0', 'user-1', f.scheduledTime, true);
    f.interaction.customId = 'confirm_match_v1_' + repo.getMatchReminder(f.id, 'bracket', '7')!.id;
    await confirm({ client: f.client } as any, f.interaction);
    expect(f.interaction.editReply).not.toHaveBeenCalled();
  });
  function row(f: ReturnType<typeof fixture>) {
    repo.recordMatchReminder(f.id, 'bracket', '7', 'user-0', 'user-1', f.scheduledTime, true);
    return repo.getMatchReminder(f.id, 'bracket', '7')!;
  }

  it('binds a DM confirmation and delay to one row, not a shared bracket in another guild', async () => {
    const f = fixture();
    const r = row(f);
    repo.recordMatchReminder(
      'other-guild',
      'bracket',
      '7',
      'user-0',
      'user-1',
      f.scheduledTime,
      true,
    );
    const other = repo.getMatchReminder('other-guild', 'bracket', '7')!;
    f.interaction.customId = 'confirm_match_v1_' + r.id;
    await confirm({ client: f.client } as any, f.interaction);
    expect(repo.getMatchReminderById(r.id)).toMatchObject({
      player1Confirmed: 1,
      player2Confirmed: 0,
    });
    expect(repo.getMatchReminderById(other.id)?.player1Confirmed).toBe(0);
    f.interaction.customId = 'delay_match_v1_' + r.id;
    await delayButton({ client: f.client } as any, f.interaction);
    expect(f.interaction.showModal.mock.calls[0][0].toJSON().custom_id).toBe(
      'delay_modal_v1_' + r.id,
    );
    f.interaction.customId = 'delay_modal_v1_' + r.id;
    await delayModal({ client: f.client } as any, f.interaction);
    expect(repo.getMatchReminderById(r.id)?.player1Delay).toBe(10);
    expect(repo.getMatchReminderById(other.id)?.player1Delay).toBeNull();
  });

  it.each([
    'outsider',
    'legacy',
    'foreign-guild',
    'left-guild',
    'disabled',
    'relinked',
    'expired',
    'revoked-during-fetch',
  ])('rejects %s controls without changes', async (mode) => {
    const f = fixture();
    const r = row(f);
    f.interaction.customId = 'confirm_match_v1_' + r.id;
    if (mode === 'outsider') f.interaction.user.id = 'outsider';
    if (mode === 'legacy') f.interaction.customId = 'confirm_match_7';
    if (mode === 'foreign-guild') f.interaction.guildId = 'foreign';
    if (mode === 'left-guild') f.guild.members.fetch.mockResolvedValue(null);
    if (mode === 'disabled') guildRepository.upsert(f.id, { tournamentsEnabled: 0 });
    if (mode === 'relinked') repo.linkTournament(f.id, 'new', 'https://challonge.com/new');
    if (mode === 'expired')
      db.prepare('UPDATE tournament_match_confirmations SET scheduled_time = ? WHERE id = ?').run(
        new Date(Date.now() - 31 * 60_000).toISOString(),
        r.id,
      );
    if (mode === 'revoked-during-fetch')
      f.guild.members.fetch.mockImplementation(async () => {
        guildRepository.upsert(f.id, { tournamentsEnabled: 0 });
        return f.members.get('user-0');
      });
    await confirm({ client: f.client } as any, f.interaction);
    expect(repo.getMatchReminderById(r.id)?.player1Confirmed).toBe(0);
    expect(f.interaction.editReply).not.toHaveBeenCalled();
  });

  it('revalidates a delayed form at submission and strictly parses versioned IDs and ranges', async () => {
    const f = fixture();
    const r = row(f);
    for (const id of [
      'confirm_match_1',
      'confirm_match_v1_0',
      'confirm_match_v1_1_extra',
      'confirm_match_v1_1e2',
    ])
      expect(parseReminderControl(id, 'confirm_match_')).toBeNull();
    f.interaction.customId = 'delay_modal_v1_' + r.id;
    f.guild.members.fetch.mockResolvedValue(null);
    await delayModal({ client: f.client } as any, f.interaction);
    expect(repo.getMatchReminderById(r.id)?.player1Delay).toBeNull();
    expect(repo.recordDelay(r.id, 'user-0', 31)).toBe(false);
    expect(repo.recordDelay(r.id, 'outsider', 10)).toBe(false);
    expect(repo.confirmMatch(r.id, 'outsider')).toBe(false);
    expect(await authorizeReminderControl(f.client, f.interaction, 'delay_modal_')).toBeNull();
  });

  it('invalidates completed matches and never reassigns an already sent control to replaced players', async () => {
    const f = fixture();
    await f.tick();
    const r = repo.getMatchReminder(f.id, 'bracket', '1')!;
    f.interaction.customId = 'confirm_match_v1_' + r.id;
    f.matches[0].state = 'complete' as any;
    await f.tick();
    await confirm({ client: f.client } as any, f.interaction);
    expect(repo.getMatchReminderById(r.id)).toMatchObject({ active: 0, player1Confirmed: 0 });
    const replacement = row(f);
    repo.claimReminderDelivery(replacement.id, 'user-0');
    repo.recordMatchReminder(f.id, 'bracket', '7', 'replacement', 'user-1', f.scheduledTime, true);
    expect(repo.getMatchReminderById(replacement.id)).toMatchObject({
      active: 0,
      player1Id: 'user-0',
    });
    expect(repo.claimReminderDelivery(replacement.id, 'user-1')).toBe(false);
  });

  it('invalidates controls if completion or a replacement is observed while fetching membership', async () => {
    const f = fixture();
    const r = row(f);
    f.interaction.customId = 'confirm_match_v1_' + r.id;
    f.guild.members.fetch.mockImplementation(async () => {
      repo.invalidateMatchReminder(f.id, 'bracket', '7');
      return f.members.get('user-0');
    });
    await confirm({ client: f.client } as any, f.interaction);
    expect(repo.getMatchReminderById(r.id)?.player1Confirmed).toBe(0);
  });
});

describe('joining a public server', () => {
  it('sends setup only to the owner of a 300-member server, with no public fallback', async () => {
    const owner = { send: vi.fn().mockResolvedValue(undefined) };
    const publicSend = vi.fn();
    const enumerate = vi.fn();
    const guild: any = {
      id: 'public',
      name: 'Public server',
      memberCount: 300,
      fetchOwner: vi.fn().mockResolvedValue(owner),
      members: { fetch: enumerate },
      channels: { cache: new Collection([['general', { send: publicSend }]]) },
      systemChannel: { send: publicSend },
    };
    await join({} as any, guild);
    expect(owner.send).toHaveBeenCalledTimes(1);
    owner.send.mockRejectedValueOnce(new Error('DMs blocked'));
    await join({} as any, guild);
    guildRepository.upsert(guild.id, { welcomeEnabled: 0 });
    await join({} as any, guild);
    expect(owner.send).toHaveBeenCalledTimes(1);
    expect(publicSend).not.toHaveBeenCalled();
    expect(enumerate).not.toHaveBeenCalled();
  });
});
