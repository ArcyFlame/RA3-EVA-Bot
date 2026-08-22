import { BaseRepository } from './base.repository';

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
  create(name: string, year: number, patch?: string): void {
    this.run('INSERT INTO masters (name, year, patch) VALUES (?, ?, ?)', [
      name,
      year,
      patch ?? null,
    ]);
  }

  findByName(name: string): Master | undefined {
    const row = this.query<MasterRow>('SELECT id, name, year, patch FROM masters WHERE name = ?', [
      name,
    ]);
    return row ? mapRow(row) : undefined;
  }

  getAll(): Master[] {
    return this.queryAll<MasterRow>(
      'SELECT id, name, year, patch FROM masters ORDER BY year DESC, name ASC',
    ).map(mapRow);
  }

  deleteByName(name: string): boolean {
    const result = this.run('DELETE FROM masters WHERE name = ?', [name]);
    return result.changes > 0;
  }
}

export const masterRepository = new MasterRepository();
