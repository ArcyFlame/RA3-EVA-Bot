import { describe, expect, it } from 'vitest';
import { DEFAULT_ACTIVITY_RANKS } from '../../src/repositories/activity-rank.repository';
import {
  activityFingerprint,
  isMeaningfulActivity,
  nextRankForPoints,
  normalizeActivityText,
  rankForPoints,
} from '../../src/services/activity-rank.service';

const definitions = DEFAULT_ACTIVITY_RANKS.map((rank) => ({ ...rank }));

describe('activity rank message filtering', () => {
  it('normalizes mentions and punctuation so cosmetic spam stays duplicate', () => {
    expect(normalizeActivityText('<@&123>   C&C ONLINE!!!')).toBe('c c online');
    expect(activityFingerprint('Play now!!!')).toBe(activityFingerprint('  PLAY now...  '));
  });

  it('does not treat a bare role ping or tiny reaction as meaningful chat', () => {
    expect(isMeaningfulActivity('<@&123>')).toBe(false);
    expect(isMeaningfulActivity('gg')).toBe(false);
    expect(isMeaningfulActivity('', ['match.png'])).toBe(true);
    expect(isMeaningfulActivity('Good game')).toBe(true);
  });
});

describe('activity rank thresholds', () => {
  it('selects current and next ranks at exact boundaries', () => {
    expect(rankForPoints(0, definitions)).toBeUndefined();
    expect(rankForPoints(10, definitions)?.title).toBe('Private');
    expect(rankForPoints(249, definitions)?.rank).toBe(1);
    expect(rankForPoints(250, definitions)?.rank).toBe(2);
    expect(nextRankForPoints(250, definitions)?.rank).toBe(3);
    expect(rankForPoints(18_000, definitions)?.title).toBe('General');
    expect(nextRankForPoints(18_000, definitions)).toBeUndefined();
  });
});
