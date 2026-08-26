import { beforeAll, describe, expect, it } from 'vitest';
import { up as up027 } from '../../src/database/migrations/027_game_seen_players';
import { GamePlayerRepository } from '../../src/repositories/game-player.repository';

const repository = new GamePlayerRepository();

beforeAll(() => {
  up027();
});

describe('GamePlayerRepository', () => {
  it('uses each platform first sample as a baseline and counts later identities', () => {
    repository.recordPlayers(
      'genevo',
      'cnc_online',
      [
        { key: 'id:1', name: 'Alpha' },
        { key: 'id:2', name: 'Bravo' },
      ],
      '2026-08-24',
    );
    repository.recordPlayers(
      'genevo',
      'cnc_online',
      [
        { key: 'id:2', name: 'Bravo' },
        { key: 'id:3', name: 'Charlie' },
      ],
      '2026-08-25',
    );
    repository.recordPlayers('genevo', 'ra3battle', [{ key: 'id:8', name: 'Delta' }], '2026-08-25');
    repository.recordPlayers(
      'genevo',
      'ra3battle',
      [
        { key: 'id:8', name: 'Delta' },
        { key: 'id:9', name: 'Echo' },
      ],
      '2026-08-26',
    );

    expect(
      repository.newPlayersByDay('genevo', ['cnc_online', 'ra3battle'], 3, '2026-08-26'),
    ).toEqual([0, 1, 1]);
    expect(repository.newPlayersByDay('genevo', ['ra3battle'], 3, '2026-08-26')).toEqual([
      null,
      0,
      1,
    ]);
  });

  it('does not start tracking from an empty lobby sample', () => {
    repository.recordPlayers('genevo', 'cnc_online', [], '2026-08-26');
    expect(repository.getTrackingStart('genevo', ['cnc_online'])).toBe('2026-08-24');
    expect(repository.newPlayersByDay('genevo', [], 3, '2026-08-26')).toEqual([null, null, null]);
  });
});
