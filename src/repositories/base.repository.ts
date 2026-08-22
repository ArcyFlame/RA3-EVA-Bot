import { db } from '../database/sqlite';
import { Database } from 'better-sqlite3';

export abstract class BaseRepository {
  protected db: Database = db;

  protected query<T = any>(sql: string, params: any[] = []): T | undefined {
    const stmt = this.db.prepare(sql);
    return stmt.get(params) as T | undefined;
  }

  protected queryAll<T = any>(sql: string, params: any[] = []): T[] {
    const stmt = this.db.prepare(sql);
    return stmt.all(params) as T[];
  }

  protected run(sql: string, params: any[] = []): { lastInsertRowid: number; changes: number } {
    const stmt = this.db.prepare(sql);
    const info = stmt.run(params);
    return { lastInsertRowid: info.lastInsertRowid as number, changes: info.changes };
  }
}
