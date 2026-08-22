import { describe, expect, it } from 'vitest';
import { aggregateSeriesScore } from '../../src/commands/tournaments/results.utils';

describe('aggregateSeriesScore', () => {
  it('turns per-game Challonge scores into one readable series score', () => {
    expect(aggregateSeriesScore('1-0,0-1,1-0,1-0,0-0')).toEqual([3, 1]);
  });

  it('keeps an already aggregated score unchanged', () => {
    expect(aggregateSeriesScore('3-2')).toEqual([3, 2]);
  });
});
