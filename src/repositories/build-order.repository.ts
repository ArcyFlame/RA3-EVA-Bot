import { BaseRepository } from './base.repository';

export interface BuildOrder {
  id: number;
  userId: string;
  name: string;
  content: string;
  createdAt: string;
}

interface BuildOrderRow {
  id: number;
  user_id: string;
  name: string;
  content: string;
  created_at: string;
}

function mapRow(row: BuildOrderRow): BuildOrder {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    content: row.content,
    createdAt: row.created_at,
  };
}

const SELECT_COLUMNS = 'id, user_id, name, content, created_at';

export class BuildOrderRepository extends BaseRepository {
  create(userId: string, name: string, content: string): void {
    this.run('INSERT INTO build_orders (user_id, name, content) VALUES (?, ?, ?)', [
      userId,
      name,
      content,
    ]);
  }

  getUserOrders(userId: string): BuildOrder[] {
    return this.queryAll<BuildOrderRow>(
      `SELECT ${SELECT_COLUMNS} FROM build_orders WHERE user_id = ? ORDER BY created_at DESC`,
      [userId],
    ).map(mapRow);
  }

  /** Recent build orders across all users (community list). */
  getRecentOrders(limit = 15): BuildOrder[] {
    return this.queryAll<BuildOrderRow>(
      `SELECT ${SELECT_COLUMNS} FROM build_orders ORDER BY created_at DESC LIMIT ?`,
      [limit],
    ).map(mapRow);
  }

  getOrder(userId: string, name: string): BuildOrder | undefined {
    const row = this.query<BuildOrderRow>(
      `SELECT id, user_id, name, content, created_at FROM build_orders WHERE user_id = ? AND name = ?`,
      [userId, name],
    );
    return row ? mapRow(row) : undefined;
  }

  getBuildById(buildId: number): BuildOrder | undefined {
    const row = this.query<BuildOrderRow>(
      `SELECT id, user_id, name, content, created_at FROM build_orders WHERE id = ?`,
      [buildId],
    );
    return row ? mapRow(row) : undefined;
  }

  /** Updates content (and optionally the name). Callers check ownership. */
  updateBuild(buildId: number, userId: string, content: string, name?: string): boolean {
    const result = name
      ? this.run('UPDATE build_orders SET content = ?, name = ? WHERE id = ? AND user_id = ?', [
          content,
          name,
          buildId,
          userId,
        ])
      : this.run('UPDATE build_orders SET content = ? WHERE id = ? AND user_id = ?', [
          content,
          buildId,
          userId,
        ]);
    return result.changes > 0;
  }

  deleteOrder(userId: string, name: string): boolean {
    const result = this.run('DELETE FROM build_orders WHERE user_id = ? AND name = ?', [
      userId,
      name,
    ]);
    return result.changes > 0;
  }
}

export const buildOrderRepository = new BuildOrderRepository();
