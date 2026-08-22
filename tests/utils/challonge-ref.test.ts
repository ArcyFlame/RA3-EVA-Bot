import { describe, expect, it } from 'vitest';
import { challongeService } from '../../src/services/challonge.service';

describe('Challonge tournament references', () => {
  it('parses standard, locale and subdomain tournament links', () => {
    expect(challongeService.parseTournamentRef('https://challonge.com/FTW13')).toBe('ftw13');
    expect(challongeService.parseTournamentRef('https://challonge.com/zh_CN/stormgatheringBN')).toBe('stormgatheringbn');
    expect(challongeService.parseTournamentRef('https://ra3.challonge.com/summer-cup')).toBe('ra3-summer-cup');
    expect(challongeService.parseTournamentRef('https://www.challonge.com/FTW13')).toBe('ftw13');
  });

  it('rejects Challonge website routes that are not brackets', () => {
    expect(challongeService.parseTournamentRef('https://challonge.com/images')).toBeNull();
    expect(challongeService.parseTournamentRef('https://challonge.com/users/123')).toBeNull();
    expect(challongeService.parseTournamentRef('images')).toBeNull();
  });
});
