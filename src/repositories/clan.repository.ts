import { BaseRepository } from './base.repository';

export interface Clan {
  id: number;
  name: string;
  tag: string;
  ownerId: string;
  guildId?: string;
  approved: number;
  color?: number;
  maxMembers: number;
  isPrivate: number;
  description?: string;
  roleId?: string;
  textChannelId?: string;
  voiceChannelId?: string;
  shatabrickClanId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClanJoinRequest {
  id: number;
  clanId: number;
  userId: string;
  message?: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

interface ClanRow {
  id: number;
  name: string;
  tag: string;
  owner_id: string;
  guild_id: string | null;
  approved: number;
  color: number | null;
  max_members: number;
  is_private: number;
  description: string | null;
  role_id: string | null;
  text_channel_id: string | null;
  voice_channel_id: string | null;
  shatabrick_clan_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ClanJoinRequestRow {
  id: number;
  clan_id: number;
  user_id: string;
  message: string | null;
  status: string;
  created_at: string;
}

function mapClan(row: ClanRow): Clan {
  return {
    id: row.id,
    name: row.name,
    tag: row.tag,
    ownerId: row.owner_id,
    guildId: row.guild_id ?? undefined,
    approved: row.approved,
    color: row.color ?? undefined,
    maxMembers: row.max_members,
    isPrivate: row.is_private,
    description: row.description ?? undefined,
    roleId: row.role_id ?? undefined,
    textChannelId: row.text_channel_id ?? undefined,
    voiceChannelId: row.voice_channel_id ?? undefined,
    shatabrickClanId: row.shatabrick_clan_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapJoinRequest(row: ClanJoinRequestRow): ClanJoinRequest {
  return {
    id: row.id,
    clanId: row.clan_id,
    userId: row.user_id,
    message: row.message ?? undefined,
    status: (row.status as ClanJoinRequest['status']) ?? 'pending',
    createdAt: row.created_at,
  };
}

/**
 * Guild-scoping clause. Legacy rows (guild_id NULL, from before the migration)
 * remain visible everywhere so no data is orphaned; every clan created since is
 * scoped to exactly one guild.
 */
function guildClause(column: string): string {
  return `(${column}.guild_id = ? OR ${column}.guild_id IS NULL)`;
}

export class ClanRepository extends BaseRepository {
  findById(id: number, guildId?: string): Clan | undefined {
    if (guildId) {
      const row = this.query<ClanRow>(
        `SELECT * FROM clans WHERE id = ? AND (guild_id = ? OR guild_id IS NULL)`,
        [id, guildId],
      );
      return row ? mapClan(row) : undefined;
    }
    const row = this.query<ClanRow>('SELECT * FROM clans WHERE id = ?', [id]);
    return row ? mapClan(row) : undefined;
  }

  findByTag(tag: string, guildId: string): Clan | undefined {
    const row = this.query<ClanRow>(
      `SELECT * FROM clans WHERE tag = ? AND ${guildClause('clans')}`,
      [tag.toUpperCase(), guildId],
    );
    return row ? mapClan(row) : undefined;
  }

  findByName(name: string, guildId: string): Clan | undefined {
    const row = this.query<ClanRow>(
      `SELECT * FROM clans WHERE name = ? AND ${guildClause('clans')}`,
      [name, guildId],
    );
    return row ? mapClan(row) : undefined;
  }

  findPending(guildId: string): Clan[] {
    return this.queryAll<ClanRow>(
      `SELECT * FROM clans WHERE approved = 0 AND ${guildClause('clans')} ORDER BY created_at ASC`,
      [guildId],
    ).map(mapClan);
  }

  findApproved(guildId: string): Clan[] {
    return this.queryAll<ClanRow>(
      `SELECT * FROM clans WHERE approved = 1 AND ${guildClause('clans')} ORDER BY name ASC`,
      [guildId],
    ).map(mapClan);
  }

  findByOwner(ownerId: string, guildId: string): Clan | undefined {
    const row = this.query<ClanRow>(
      `SELECT * FROM clans WHERE owner_id = ? AND approved = 1 AND ${guildClause('clans')}`,
      [ownerId, guildId],
    );
    return row ? mapClan(row) : undefined;
  }

  /** Returns the approved clan the user belongs to, if any (single query, no N+1). */
  findClanOfUser(userId: string, guildId: string): Clan | undefined {
    const row = this.query<ClanRow>(
      `SELECT c.* FROM clans c
       JOIN clan_members m ON m.clan_id = c.id
       WHERE m.user_id = ? AND c.approved = 1 AND ${guildClause('c')}`,
      [userId, guildId],
    );
    return row ? mapClan(row) : undefined;
  }

  create(data: Omit<Clan, 'id' | 'createdAt' | 'updatedAt'>): number {
    const result = this.run(
      `INSERT INTO clans (name, tag, owner_id, guild_id, approved, color, max_members, is_private, description, role_id, text_channel_id, voice_channel_id, shatabrick_clan_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.name,
        data.tag,
        data.ownerId,
        data.guildId ?? null,
        data.approved ?? 0,
        data.color ?? null,
        data.maxMembers ?? 50,
        data.isPrivate ?? 0,
        data.description ?? null,
        data.roleId ?? null,
        data.textChannelId ?? null,
        data.voiceChannelId ?? null,
        data.shatabrickClanId ?? null,
      ],
    );
    return result.lastInsertRowid;
  }

  approveClan(id: number, roleId: string, textChannelId: string, voiceChannelId: string): void {
    this.run(
      `UPDATE clans SET approved = 1, role_id = ?, text_channel_id = ?, voice_channel_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [roleId, textChannelId, voiceChannelId, id],
    );
  }

  rejectClan(id: number): boolean {
    const result = this.run('DELETE FROM clans WHERE id = ? AND approved = 0', [id]);
    return result.changes > 0;
  }

  updateDescription(id: number, description: string | null): void {
    this.run('UPDATE clans SET description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
      description,
      id,
    ]);
  }

  updateMaxMembers(id: number, maxMembers: number): void {
    this.run('UPDATE clans SET max_members = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
      maxMembers,
      id,
    ]);
  }

  updateColor(id: number, color: number | null): void {
    this.run('UPDATE clans SET color = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
      color,
      id,
    ]);
  }

  togglePrivacy(id: number, isPrivate: boolean): void {
    this.run('UPDATE clans SET is_private = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
      isPrivate ? 1 : 0,
      id,
    ]);
  }

  transferOwnership(id: number, newOwnerId: string): void {
    this.run('UPDATE clans SET owner_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
      newOwnerId,
      id,
    ]);
  }

  deleteClan(id: number): void {
    this.run('DELETE FROM clans WHERE id = ?', [id]);
  }

  addMember(clanId: number, userId: string): void {
    this.run('INSERT OR IGNORE INTO clan_members (clan_id, user_id) VALUES (?, ?)', [
      clanId,
      userId,
    ]);
  }

  removeMember(clanId: number, userId: string): void {
    this.run('DELETE FROM clan_members WHERE clan_id = ? AND user_id = ?', [clanId, userId]);
  }

  getMembers(clanId: number): string[] {
    const rows = this.queryAll<{ user_id: string }>(
      'SELECT user_id FROM clan_members WHERE clan_id = ?',
      [clanId],
    );
    return rows.map((r) => r.user_id);
  }

  getMemberCount(clanId: number): number {
    const row = this.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM clan_members WHERE clan_id = ?',
      [clanId],
    );
    return row?.count ?? 0;
  }

  /** Batch member counts for many clans in one query (avoids an N+1 per clan). */
  getMemberCounts(clanIds: number[]): Map<number, number> {
    const map = new Map<number, number>();
    if (clanIds.length === 0) return map;
    const placeholders = clanIds.map(() => '?').join(',');
    const rows = this.queryAll<{ clan_id: number; count: number }>(
      `SELECT clan_id, COUNT(*) as count FROM clan_members WHERE clan_id IN (${placeholders}) GROUP BY clan_id`,
      clanIds,
    );
    for (const row of rows) map.set(row.clan_id, row.count);
    return map;
  }

  /** True when the user already has a pending request for this clan. */
  hasPendingRequest(clanId: number, userId: string): boolean {
    const row = this.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM clan_join_requests WHERE clan_id = ? AND user_id = ? AND status = 'pending'`,
      [clanId, userId],
    );
    return (row?.count ?? 0) > 0;
  }

  addJoinRequest(clanId: number, userId: string, message?: string): void {
    this.run('INSERT INTO clan_join_requests (clan_id, user_id, message) VALUES (?, ?, ?)', [
      clanId,
      userId,
      message ?? null,
    ]);
  }

  getPendingRequests(clanId: number): ClanJoinRequest[] {
    return this.queryAll<ClanJoinRequestRow>(
      `SELECT * FROM clan_join_requests WHERE clan_id = ? AND status = 'pending' ORDER BY created_at ASC`,
      [clanId],
    ).map(mapJoinRequest);
  }

  acceptRequest(requestId: number): void {
    this.run(`UPDATE clan_join_requests SET status = 'accepted' WHERE id = ?`, [requestId]);
  }

  rejectRequest(requestId: number): void {
    this.run(`UPDATE clan_join_requests SET status = 'rejected' WHERE id = ?`, [requestId]);
  }

  updateShatabrickId(id: number, shatabrickId: string | null): void {
    this.run(
      'UPDATE clans SET shatabrick_clan_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [shatabrickId, id],
    );
  }

  getRequestById(requestId: number): ClanJoinRequest | undefined {
    const row = this.query<ClanJoinRequestRow>('SELECT * FROM clan_join_requests WHERE id = ?', [
      requestId,
    ]);
    return row ? mapJoinRequest(row) : undefined;
  }
}

export const clanRepository = new ClanRepository();
