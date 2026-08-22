import { describe, it, expect, beforeAll } from 'vitest';
import { up as up001 } from '../../src/database/migrations/001_initial_schema';
import { up as up004 } from '../../src/database/migrations/004_clans_guild_id';
import { TournamentRepository } from '../../src/repositories/tournament.repository';
import { ClanRepository } from '../../src/repositories/clan.repository';

const tournamentRepo = new TournamentRepository();
const clanRepo = new ClanRepository();

beforeAll(() => {
  up001();
  up004();
});

describe('TournamentRepository', () => {
  it('links and reads back a tournament', () => {
    tournamentRepo.linkTournament('g1', '123', 'https://challonge.com/123');
    expect(tournamentRepo.getLinkedTournamentId('g1')).toBe('123');
    expect(tournamentRepo.getLinkedTournaments()).toEqual([{ guildId: 'g1', tournamentId: '123' }]);
  });

  it('inserts a match report and reads back the row', () => {
    const id = tournamentRepo.insertMatch({
      tournamentId: '123',
      challongeMatchId: '1',
      player1Id: '10',
      player2Id: '20',
      player1Score: 3,
      player2Score: 1,
      winnerId: '10',
      reportedBy: 'u1',
      proofUrl: null,
    });
    expect(id).toBeGreaterThan(0);
  });

  it('records and reads a match reminder without throwing', () => {
    expect(() =>
      tournamentRepo.recordMatchReminder('g1', '123', '1', 'p1', 'p2', null),
    ).not.toThrow();
    const reminder = tournamentRepo.getMatchReminder('g1', '123', '1');
    expect(reminder?.reminderSent).toBe(1);
  });

  it('confirmMatch marks only the clicking player', () => {
    tournamentRepo.confirmMatch('1', 'p1');
    const reminder = tournamentRepo.getMatchReminder('g1', '123', '1');
    expect(reminder).toBeDefined();
  });
});

describe('ClanRepository.getMemberCounts', () => {
  it('counts members across clans in a single query', () => {
    const clanId = clanRepo.create({
      name: 'Test Clan',
      tag: 'TEST',
      ownerId: 'u1',
      approved: 1,
      maxMembers: 10,
      isPrivate: 0,
    });
    clanRepo.addMember(clanId, 'u1');
    clanRepo.addMember(clanId, 'u2');
    const counts = clanRepo.getMemberCounts([clanId, 9999]);
    expect(counts.get(clanId)).toBe(2);
    expect(counts.get(9999)).toBeUndefined();
  });
});
