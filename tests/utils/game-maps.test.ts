import { describe, expect, it } from 'vitest';
import {
  GENEVO_RAW_MAPS,
  RA3_TOURNAMENT_MAPS,
  cleanGameMapName,
  gameMapNames,
  isKnownGameMap,
  matchesGameLobby,
} from '../../src/data/game-maps';

describe('game map catalogs', () => {
  it('uses the requested seven-map RA3 tournament pool', () => {
    expect(RA3_TOURNAMENT_MAPS).toEqual([
      'Battlebase Beta',
      'Cabana Republic',
      'Fire Island',
      'Industrial Strength',
      'Infinity Isle',
      'Snow Plow',
      'Temple Prime',
    ]);
  });

  it('contains all 48 Generals Evolution 0.33 identifiers', () => {
    expect(GENEVO_RAW_MAPS).toHaveLength(48);
    expect(gameMapNames('genevo')).toHaveLength(48);
  });

  it('classifies and formats Generals Evolution maps without accepting RA3 maps', () => {
    expect(isKnownGameMap('genevo033_sgor00_skrm_25', 'genevo')).toBe(true);
    expect(cleanGameMapName('genevo033_sgor00_skrm_25', 'genevo')).toBe('GenEvo033 sgor00 Skrm 25');
    expect(isKnownGameMap('Infinity Isle', 'genevo')).toBe(false);
  });

  it('separates RA3-engine lobbies by map and platform mod metadata', () => {
    expect(matchesGameLobby('genevo033_darkyuri_skrm_02', undefined, 'genevo')).toBe(true);
    expect(matchesGameLobby('A future map', 'GenEvo', 'genevo')).toBe(true);
    expect(matchesGameLobby('Infinity Isle', 'RA3', 'ra3')).toBe(true);
    expect(matchesGameLobby('Infinity Isle', 'corona', 'ra3')).toBe(false);
    expect(matchesGameLobby('Infinity Isle', 'RA3', 'genevo')).toBe(false);
  });
});
