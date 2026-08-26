import { describe, expect, it } from 'vitest';
import { mapEliminationInstructions } from '../../src/commands/misc/pickmap.command';
import { GAME_CONFIGS } from '../../src/config/games';

describe('map elimination guide', () => {
  it('uses lower seed priority and alternating removals', () => {
    const guide = mapEliminationInstructions();
    expect(guide).toContain('lower seed number');
    expect(guide).toContain('Player A removes one map');
    expect(guide).toContain('Player B removes one map');
    expect(guide).toContain('three maps left');
    expect(guide).toContain('BO5');
  });

  it('uses the official Generals Evolution downloads page', () => {
    expect(GAME_CONFIGS.genevo.moddbDownloadsUrl).toBe(
      'https://www.moddb.com/mods/command-and-conquer-generals-evolution/downloads',
    );
  });
});
