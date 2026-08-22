import { describe, expect, it } from 'vitest';
import { resolveTournamentStatus } from '../../src/utils/tournament-status';

describe('resolveTournamentStatus', () => {
  it('keeps an explicitly active tournament joinable', () => {
    expect(resolveTournamentStatus({ storedStatus: 'registration' })).toBe('registration');
  });

  it('uses the completed bracket state over a registration link', () => {
    expect(
      resolveTournamentStatus({
        storedStatus: 'ended',
        registrationUrl: 'https://example.com/register',
      }),
    ).toBe('ended');
  });
});
