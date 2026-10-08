import { BaseRepository } from './base.repository';

export const MESSAGE_POINTS = 10;
export const CNC_PING_POINTS = 25;
export const MESSAGE_COOLDOWN_MS = 60_000;
export const DUPLICATE_COOLDOWN_MS = 6 * 60 * 60 * 1000;
export const MAX_DAILY_MESSAGE_AWARDS = 50;

export const DEFAULT_ACTIVITY_RANKS = [
  { rank: 1, title: 'Private', threshold: 10 },
  { rank: 2, title: 'Corporal', threshold: 250 },
  { rank: 3, title: 'Sergeant', threshold: 750 },
  { rank: 4, title: 'Lieutenant', threshold: 1_500 },
  { rank: 5, title: 'Captain', threshold: 3_000 },
  { rank: 6, title: 'Major', threshold: 5_000 },
  { rank: 7, title: 'Colonel', threshold: 8_000 },
  { rank: 8, title: 'Brigadier', threshold: 12_000 },
  { rank: 9, title: 'General', threshold: 18_000 },
] as const;

export interface ActivityRankDefinition {
  rank: number;
  title: string;
  threshold: number;
  roleId?: string;
}

export interface MemberActivity {
  guildId: string;
  userId: string;
  points: number;
  qualifyingMessages: number;
  qualifyingCncPings: number;
  lastCncPingDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecordActivityInput {
  guildId: string;
  userId: string;
  nowMs: number;
  activityDate: string;
  meaningfulMessage: boolean;
  fingerprint?: string;
  hasCncPing: boolean;
}

export interface RecordActivityResult {
  before: MemberActivity;
  after: MemberActivity;
  messageAwarded: boolean;
  cncPingAwarded: boolean;
  pointsAwarded: number;
  messageBlockedBy: 'cooldown' | 'duplicate' | 'daily_cap' | 'not_meaningful' | null;
}

interface ActivityRow {
  guild_id: string;
  user_id: string;
  points: number;
  qualifying_messages: number;
  qualifying_cnc_pings: number;
  last_message_awarded_at_ms: number | null;
  last_message_fingerprint: string | null;
  last_fingerprint_awarded_at_ms: number | null;
  last_cnc_ping_date: string | null;
  created_at: string;
  updated_at: string;
}

interface DailyRow {
  message_awards: number;
  cnc_ping_awarded: number;
}

function mapMember(row: ActivityRow): MemberActivity {
  return {
    guildId: row.guild_id,
    userId: row.user_id,
    points: row.points,
    qualifyingMessages: row.qualifying_messages,
    qualifyingCncPings: row.qualifying_cnc_pings,
    lastCncPingDate: row.last_cnc_ping_date ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ActivityRankRepository extends BaseRepository {
  getMember(guildId: string, userId: string): MemberActivity | undefined {
    const row = this.query<ActivityRow>(
      'SELECT * FROM member_activity WHERE guild_id = ? AND user_id = ?',
      [guildId, userId],
    );
    return row ? mapMember(row) : undefined;
  }

  recordActivity(input: RecordActivityInput): RecordActivityResult {
    const transaction = this.db.transaction(() => {
      this.run(`INSERT OR IGNORE INTO member_activity (guild_id, user_id) VALUES (?, ?)`, [
        input.guildId,
        input.userId,
      ]);
      this.run(
        `INSERT OR IGNORE INTO activity_daily_totals
          (guild_id, user_id, activity_date) VALUES (?, ?, ?)`,
        [input.guildId, input.userId, input.activityDate],
      );

      const row = this.query<ActivityRow>(
        'SELECT * FROM member_activity WHERE guild_id = ? AND user_id = ?',
        [input.guildId, input.userId],
      );
      const daily = this.query<DailyRow>(
        `SELECT message_awards, cnc_ping_awarded FROM activity_daily_totals
         WHERE guild_id = ? AND user_id = ? AND activity_date = ?`,
        [input.guildId, input.userId, input.activityDate],
      );
      if (!row || !daily) throw new Error('Could not initialize member activity');

      const before = mapMember(row);
      let messageAwarded = false;
      let cncPingAwarded = false;
      let pointsAwarded = 0;
      let messageBlockedBy: RecordActivityResult['messageBlockedBy'] = null;

      if (input.hasCncPing && daily.cnc_ping_awarded === 0) {
        cncPingAwarded = true;
        pointsAwarded += CNC_PING_POINTS;
        this.run(
          `UPDATE activity_daily_totals SET cnc_ping_awarded = 1
           WHERE guild_id = ? AND user_id = ? AND activity_date = ?`,
          [input.guildId, input.userId, input.activityDate],
        );
        this.run(
          `UPDATE member_activity
           SET points = points + ?, qualifying_cnc_pings = qualifying_cnc_pings + 1,
               last_cnc_ping_date = ?, updated_at = CURRENT_TIMESTAMP
           WHERE guild_id = ? AND user_id = ?`,
          [CNC_PING_POINTS, input.activityDate, input.guildId, input.userId],
        );
      }

      if (!input.meaningfulMessage || !input.fingerprint) {
        messageBlockedBy = 'not_meaningful';
      } else if (
        row.last_message_awarded_at_ms !== null &&
        input.nowMs - row.last_message_awarded_at_ms < MESSAGE_COOLDOWN_MS
      ) {
        messageBlockedBy = 'cooldown';
      } else if (
        row.last_message_fingerprint === input.fingerprint &&
        row.last_fingerprint_awarded_at_ms !== null &&
        input.nowMs - row.last_fingerprint_awarded_at_ms < DUPLICATE_COOLDOWN_MS
      ) {
        messageBlockedBy = 'duplicate';
      } else if (daily.message_awards >= MAX_DAILY_MESSAGE_AWARDS) {
        messageBlockedBy = 'daily_cap';
      } else {
        messageAwarded = true;
        pointsAwarded += MESSAGE_POINTS;
        this.run(
          `UPDATE activity_daily_totals SET message_awards = message_awards + 1
           WHERE guild_id = ? AND user_id = ? AND activity_date = ?`,
          [input.guildId, input.userId, input.activityDate],
        );
        this.run(
          `UPDATE member_activity
           SET points = points + ?, qualifying_messages = qualifying_messages + 1,
               last_message_awarded_at_ms = ?, last_message_fingerprint = ?,
               last_fingerprint_awarded_at_ms = ?, updated_at = CURRENT_TIMESTAMP
           WHERE guild_id = ? AND user_id = ?`,
          [
            MESSAGE_POINTS,
            input.nowMs,
            input.fingerprint,
            input.nowMs,
            input.guildId,
            input.userId,
          ],
        );
      }

      const updated = this.query<ActivityRow>(
        'SELECT * FROM member_activity WHERE guild_id = ? AND user_id = ?',
        [input.guildId, input.userId],
      );
      if (!updated) throw new Error('Member activity disappeared during update');
      return {
        before,
        after: mapMember(updated),
        messageAwarded,
        cncPingAwarded,
        pointsAwarded,
        messageBlockedBy,
      };
    });
    return transaction();
  }

  getRankDefinitions(guildId: string): ActivityRankDefinition[] {
    const configured = this.queryAll<{ rank: number; role_id: string; threshold: number }>(
      `SELECT rank, role_id, threshold FROM activity_rank_roles
       WHERE guild_id = ? ORDER BY rank ASC`,
      [guildId],
    );
    const byRank = new Map(configured.map((row) => [row.rank, row]));
    return DEFAULT_ACTIVITY_RANKS.map((defaults) => {
      const row = byRank.get(defaults.rank);
      return {
        rank: defaults.rank,
        title: defaults.title,
        threshold: row?.threshold ?? defaults.threshold,
        roleId: row?.role_id,
      };
    });
  }

  setRankRole(guildId: string, rank: number, roleId: string, threshold: number): void {
    if (!Number.isInteger(rank) || rank < 1 || rank > 9) throw new Error('Rank must be 1-9');
    if (!Number.isInteger(threshold) || threshold < 0) {
      throw new Error('Threshold must be a non-negative integer');
    }
    const transaction = this.db.transaction(() => {
      this.run('DELETE FROM activity_rank_roles WHERE guild_id = ? AND role_id = ? AND rank <> ?', [
        guildId,
        roleId,
        rank,
      ]);
      this.run(
        `INSERT INTO activity_rank_roles (guild_id, rank, role_id, threshold)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(guild_id, rank) DO UPDATE SET
           role_id = excluded.role_id,
           threshold = excluded.threshold,
           updated_at = CURRENT_TIMESTAMP`,
        [guildId, rank, roleId, threshold],
      );
    });
    transaction();
  }

  getLeaderboard(guildId: string, limit = 10): MemberActivity[] {
    const safeLimit = Math.max(1, Math.min(25, Math.trunc(limit)));
    return this.queryAll<ActivityRow>(
      `SELECT * FROM member_activity WHERE guild_id = ?
       ORDER BY points DESC, updated_at ASC, user_id ASC LIMIT ?`,
      [guildId, safeLimit],
    ).map(mapMember);
  }

  getMemberPosition(guildId: string, userId: string): number | undefined {
    const member = this.getMember(guildId, userId);
    if (!member) return undefined;
    const row = this.query<{ position: number }>(
      `SELECT COUNT(*) + 1 AS position FROM member_activity
       WHERE guild_id = ? AND points > ?`,
      [guildId, member.points],
    );
    return row?.position;
  }

  getTrackedUserIds(guildId: string): string[] {
    return this.queryAll<{ user_id: string }>(
      'SELECT user_id FROM member_activity WHERE guild_id = ? ORDER BY user_id',
      [guildId],
    ).map((row) => row.user_id);
  }

  adjustPoints(guildId: string, userId: string, amount: number): MemberActivity {
    if (!Number.isInteger(amount)) throw new Error('Point adjustment must be an integer');
    this.run('INSERT OR IGNORE INTO member_activity (guild_id, user_id) VALUES (?, ?)', [
      guildId,
      userId,
    ]);
    this.run(
      `UPDATE member_activity SET points = MAX(0, points + ?), updated_at = CURRENT_TIMESTAMP
       WHERE guild_id = ? AND user_id = ?`,
      [amount, guildId, userId],
    );
    const member = this.getMember(guildId, userId);
    if (!member) throw new Error('Could not update member activity');
    return member;
  }

  resetMember(guildId: string, userId: string): void {
    const transaction = this.db.transaction(() => {
      this.run('DELETE FROM activity_daily_totals WHERE guild_id = ? AND user_id = ?', [
        guildId,
        userId,
      ]);
      this.run('DELETE FROM member_activity WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
    });
    transaction();
  }
}

export const activityRankRepository = new ActivityRankRepository();
