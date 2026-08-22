import { describe, expect, it } from 'vitest';
import { normalizeTournamentWinnerNames } from '../../src/utils/winner-names';

describe('normalizeTournamentWinnerNames', () => {
  it('splits a numbered Challonge team into both winners', () => {
    expect(normalizeTournamentWinnerNames('team 1 andrey and greeeen')).toEqual([
      'andrey',
      'greeeen',
    ]);
  });

  it('removes a disqualification suffix without changing the player name', () => {
    expect(normalizeTournamentWinnerNames('Zugspitze DQ')).toEqual(['Zugspitze']);
  });

  it('does not split an ordinary nickname containing spaces', () => {
    expect(normalizeTournamentWinnerNames('Khaibar Lemonade')).toEqual(['Khaibar Lemonade']);
  });

  it('splits slash-separated winners for a team event', () => {
    expect(normalizeTournamentWinnerNames('*s-A-w / *TehPunch', true)).toEqual([
      '*s-A-w',
      '*TehPunch',
    ]);
  });

  it('removes a trailing alternate forum account name', () => {
    expect(normalizeTournamentWinnerNames('Puzzlez (WalftheWolf)')).toEqual(['Puzzlez']);
  });
});
