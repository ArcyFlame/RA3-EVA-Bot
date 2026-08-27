import { describe, expect, it } from 'vitest';
import { getQuoteForTip } from '../../src/commands/info/tips.command';

describe('tip quotes', () => {
  it('matches RA3 quotes to the tip subject', () => {
    expect(
      getQuoteForTip({ text: 'Use Cryocopters to freeze an Apocalypse Tank.', faction: 'allies' }),
    ).toContain('Cryocopter');
    expect(
      getQuoteForTip({ text: 'Keep Kirovs away from anti-air.', faction: 'soviets' }),
    ).toContain('Kirov');
    expect(getQuoteForTip({ text: 'Transform Tengus to escape.', faction: 'empire' })).toContain(
      'Tengu',
    );
  });
});
