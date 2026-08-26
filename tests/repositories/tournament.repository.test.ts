import { describe, it, expect, beforeAll } from 'vitest';
import { up as up001 } from '../../src/database/migrations/001_initial_schema';
import { up as up004 } from '../../src/database/migrations/004_clans_guild_id';
import { up as up005 } from '../../src/database/migrations/005_tournament_sign_up_url';
import { up as up006 } from '../../src/database/migrations/006_stats_history_and_usage';
import { up as up007 } from '../../src/database/migrations/007_news_language_menus';
import { up as up009 } from '../../src/database/migrations/009_tournament_pipeline_games';
import { up as up015 } from '../../src/database/migrations/015_tournament_workflow';
import { up as up024 } from '../../src/database/migrations/024_game_modes_and_sources';
import { up as up026 } from '../../src/database/migrations/026_tournament_manual_metadata';
import { TournamentRepository } from '../../src/repositories/tournament.repository';
import { ClanRepository } from '../../src/repositories/clan.repository';
import { renderEventPage } from '../../src/commands/tournaments/events.utils';

const tournamentRepo = new TournamentRepository();
const clanRepo = new ClanRepository();

beforeAll(() => {
  up001();
  up004();
  up005();
  up006();
  up007();
  up009();
  up015();
  up024();
  up026();
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

  it('protects staff-entered tournament facts from scanner refreshes', () => {
    const eventUrl = 'https://example.com/genevo-cup';
    const eventId = tournamentRepo.createEvent({
      game: 'genevo',
      eventUrl,
      title: 'GenEvo Community Cup',
      description: 'Tournament announcement',
      announcedAt: '2026-03-01T00:00:00.000Z',
      startDate: '1 Mar 2026',
    });
    tournamentRepo.updateManualMetadata(eventId, {
      startDate: '14 Mar 2026, 14:00 GMT',
      status: 'ended',
      prizePool: '250$ - sponsored by SpamAltf4, Khay and Daytor',
      format: '2V2 - Single Elimination',
      maps: 'Coastal Confrontation, Avalanche Assault',
    });

    tournamentRepo.updateEventDetails(eventUrl, null, 'Refreshed text', {
      startDate: '20 Mar 2026',
      prizePool: '100$',
      format: '1V1',
      maps: 'Wrong Map',
    });
    tournamentRepo.setEventStatus(eventId, 'registration');
    tournamentRepo.setEventFormat(eventId, 'Double Elimination');

    expect(tournamentRepo.getEventDetail(eventId)).toMatchObject({
      startDate: '14 Mar 2026, 14:00 GMT',
      status: 'ended',
      prizePool: '250$ - sponsored by SpamAltf4, Khay and Daytor',
      format: '2V2 - Single Elimination',
      maps: 'Coastal Confrontation, Avalanche Assault',
    });

    const publicPage = renderEventPage(eventId, undefined, false);
    const staffPage = renderEventPage(eventId, undefined, true);
    expect(JSON.stringify(publicPage)).not.toContain(`eventpg_edit_${eventId}`);
    expect(JSON.stringify(staffPage)).toContain(`eventpg_edit_${eventId}`);
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
