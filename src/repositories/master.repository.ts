import { BaseRepository } from './base.repository';
import { GameId } from '../config/games';

export interface Master {
  id: number;
  name: string;
  year: number;
  patch?: string;
}

interface MasterRow {
  id: number;
  name: string;
  year: number;
  patch: string | null;
}

function mapRow(row: MasterRow): Master {
  return { id: row.id, name: row.name, year: row.year, patch: row.patch ?? undefined };
}

export class MasterRepository extends BaseRepository {
  create(name: string, year: number, patch?: string, game: GameId = 'ra3'): void {
    this.run('INSERT INTO masters (name, year, patch, game) VALUES (?, ?, ?, ?)', [
      name,
      year,
      patch ?? null,
      game,
    ]);
  }

  findByName(name: string, game: GameId = 'ra3'): Master | undefined {
    const row = this.query<MasterRow>(
      'SELECT id, name, year, patch FROM masters WHERE name = ? AND game = ?',
      [name, game],
    );
    return row ? mapRow(row) : undefined;
  }

  getAll(game: GameId = 'ra3'): Master[] {
    return this.queryAll<MasterRow>(
      'SELECT id, name, year, patch FROM masters WHERE game = ? ORDER BY year DESC, name ASC',
      [game],
    ).map(mapRow);
  }

  deleteByName(name: string, game: GameId = 'ra3'): boolean {
    const result = this.run('DELETE FROM masters WHERE name = ? AND game = ?', [name, game]);
    return result.changes > 0;
  }
}

export const masterRepository = new MasterRepository();
