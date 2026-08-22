import { BaseRepository } from './base.repository';

export interface Warning {
  id: number;
  guildId: string;
  userId: string;
  moderatorId: string;
  reason?: string;
  createdAt: string;
}

interface WarningRow {
  id: number;
  guild_id: string;
  user_id: string;
  moderator_id: string;
  reason: string | null;
  created_at: string;
}

function mapRow(row: WarningRow): Warning {
  return {
    id: row.id,
    guildId: row.guild_id,
    userId: row.user_id,
    moderatorId: row.moderator_id,
    reason: row.reason ?? undefined,
    createdAt: row.created_at,
  };
}

export class WarningRepository extends BaseRepository {
  getWarningsForUser(guildId: string, userId: string): Warning[] {
    const rows = this.queryAll<WarningRow>(
      'SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC',
      [guildId, userId],
    );
    return rows.map(mapRow);
  }

  clearWarningsForUser(guildId: string, userId: string): number {
    const result = this.run('DELETE FROM warnings WHERE guild_id = ? AND user_id = ?', [
      guildId,
      userId,
    ]);
    return result.changes;
  }

  addWarning(guildId: string, userId: string, moderatorId: string, reason: string): Warning {
    const result = this.run(
      'INSERT INTO warnings (guild_id, user_id, moderator_id, reason) VALUES (?, ?, ?, ?)',
      [guildId, userId, moderatorId, reason],
    );
    const row = this.query<WarningRow>('SELECT * FROM warnings WHERE id = ?', [
      result.lastInsertRowid,
    ]);
    if (!row) throw new Error('Failed to read back inserted warning');
    return mapRow(row);
  }
}

export const warningRepository = new WarningRepository();
