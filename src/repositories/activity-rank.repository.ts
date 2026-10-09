import { BaseRepository } from './base.repository';

export const MAX_ACTIVITY_RANKS = 100;
export const DEFAULT_REPLAY_CHANNEL_ID = '1321748469735620640';
export const DEFAULT_ACTIVITY_TITLES = [
  'Private',
  'Corporal',
  'Sergeant',
  'Lieutenant',
  'Captain',
  'Major',
  'Colonel',
  'Brigadier',
  'General',
];

export interface ActivityRankDefinition {
  id: number;
  rank: number;
  title: string;
  threshold: number;
  roleId?: string;
}

export interface ActivitySettings {
  pingEnabled: boolean;
  replayEnabled: boolean;
  pingPoints: number;
  replayPoints: number;
  replayDailyCap: number;
  replayChannelId: string;
  progressionMode: 'per_rank' | 'max_days';
  daysPerRank: number;
  maxRankDays: number;
  xpPerLevel: number;
  version: number;
}

export interface MemberActivity {
  guildId: string;
  userId: string;
  points: number;
  qualifyingCncPings: number;
  qualifyingReplays: number;
  lastCncPingDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecordActivityInput {
  guildId: string;
  userId: string;
  activityDate: string;
  hasCncPing: boolean;
  replayFingerprints: string[];
}

export interface RecordActivityResult {
  before: MemberActivity;
  after: MemberActivity;
  cncPingAwarded: boolean;
  replaysAwarded: number;
  pointsAwarded: number;
}

interface ActivityRow {
  guild_id: string;
  user_id: string;
  points: number;
  qualifying_cnc_pings: number;
  qualifying_replays: number;
  last_cnc_ping_date: string | null;
  created_at: string;
  updated_at: string;
}

interface SettingsRow {
  ping_enabled: number;
  replay_enabled: number;
  ping_points: number;
  replay_points: number;
  replay_daily_cap: number;
  replay_channel_id: string;
  progression_mode: 'per_rank' | 'max_days';
  days_per_rank: number;
  max_rank_days: number;
  xp_per_level: number;
  version: number;
  initialized: number;
}

function mapMember(row: ActivityRow): MemberActivity {
  return {
    guildId: row.guild_id,
    userId: row.user_id,
    points: row.points,
    qualifyingCncPings: row.qualifying_cnc_pings,
    qualifyingReplays: row.qualifying_replays,
    lastCncPingDate: row.last_cnc_ping_date ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function integer(value: number, min: number, max: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(label + ' must be a whole number from ' + min + ' to ' + max + '.');
  }
}

export class ActivityRankRepository extends BaseRepository {
  private initialize(guildId: string): void {
    this.db.transaction(() => {
      this.run('INSERT OR IGNORE INTO activity_rank_settings (guild_id) VALUES (?)', [guildId]);
      const row = this.query<SettingsRow>(
        'SELECT * FROM activity_rank_settings WHERE guild_id = ?',
        [guildId],
      )!;
      if (row.initialized) return;
      DEFAULT_ACTIVITY_TITLES.forEach((title, index) => {
        this.run(
          'INSERT OR IGNORE INTO activity_rank_roles (guild_id, rank, title, threshold) VALUES (?, ?, ?, ?)',
          [guildId, index + 1, title, (index + 1) * 50 * 25],
        );
      });
      this.run('UPDATE activity_rank_settings SET initialized = 1 WHERE guild_id = ?', [guildId]);
    })();
  }

  getSettings(guildId: string): ActivitySettings {
    this.initialize(guildId);
    const row = this.query<SettingsRow>('SELECT * FROM activity_rank_settings WHERE guild_id = ?', [
      guildId,
    ])!;
    return {
      pingEnabled: !!row.ping_enabled,
      replayEnabled: !!row.replay_enabled,
      pingPoints: row.ping_points,
      replayPoints: row.replay_points,
      replayDailyCap: row.replay_daily_cap,
      replayChannelId: row.replay_channel_id,
      progressionMode: row.progression_mode,
      daysPerRank: row.days_per_rank,
      maxRankDays: row.max_rank_days,
      xpPerLevel: row.xp_per_level,
      version: row.version,
    };
  }

  assertVersion(guildId: string, version: number): void {
    if (this.getSettings(guildId).version !== version) {
      throw new Error('Settings changed in another menu. Reopen /activity_admin and try again.');
    }
  }

  private bumpVersion(guildId: string): void {
    this.run('UPDATE activity_rank_settings SET version = version + 1 WHERE guild_id = ?', [
      guildId,
    ]);
  }

  touchConfiguration(guildId: string, version: number): void {
    this.assertVersion(guildId, version);
    this.bumpVersion(guildId);
  }

  claimReplayDownload(guildId: string, userId: string, date: string): boolean {
    return this.db.transaction(() => {
      const settings = this.getSettings(guildId);
      if (!settings.replayEnabled) return false;
      this.run(
        'INSERT OR IGNORE INTO activity_daily_totals (guild_id, user_id, activity_date) VALUES (?, ?, ?)',
        [guildId, userId, date],
      );
      // Bound invalid/reposted file traffic as well as successful awards, across restarts.
      return (
        this.run(
          `UPDATE activity_daily_totals SET replay_downloads = replay_downloads + 1
        WHERE guild_id = ? AND user_id = ? AND activity_date = ? AND replay_awards < ? AND replay_downloads < ?`,
          [guildId, userId, date, settings.replayDailyCap, settings.replayDailyCap * 2],
        ).changes === 1
      );
    })();
  }

  updateSettings(
    guildId: string,
    values: Partial<Omit<ActivitySettings, 'version'>>,
    version: number,
  ): void {
    this.db.transaction(() => {
      this.assertVersion(guildId, version);
      const next = { ...this.getSettings(guildId), ...values };
      integer(next.pingPoints, 1, 10000, 'Ping XP');
      integer(next.replayPoints, 1, 10000, 'Replay XP');
      integer(next.replayDailyCap, 1, 20, 'Daily replay limit');
      integer(next.daysPerRank, 1, 10000, 'Days per rank');
      integer(next.maxRankDays, 1, 100000, 'Days to the highest rank');
      integer(next.xpPerLevel, 1, 1000000, 'XP per level');
      if (!['per_rank', 'max_days'].includes(next.progressionMode))
        throw new Error('Unknown progression mode.');
      if (!/^\d{17,20}$/.test(next.replayChannelId))
        throw new Error('Choose a valid replay channel.');
      this.run(
        `UPDATE activity_rank_settings SET ping_enabled = ?, replay_enabled = ?,
        ping_points = ?, replay_points = ?, replay_daily_cap = ?, replay_channel_id = ?,
        progression_mode = ?, days_per_rank = ?, max_rank_days = ?, xp_per_level = ?
        WHERE guild_id = ?`,
        [
          Number(next.pingEnabled),
          Number(next.replayEnabled),
          next.pingPoints,
          next.replayPoints,
          next.replayDailyCap,
          next.replayChannelId,
          next.progressionMode,
          next.daysPerRank,
          next.maxRankDays,
          next.xpPerLevel,
          guildId,
        ],
      );
      if (
        values.pingPoints !== undefined ||
        values.daysPerRank !== undefined ||
        values.maxRankDays !== undefined ||
        values.progressionMode !== undefined
      )
        this.rescaleRanks(guildId);
      this.bumpVersion(guildId);
    })();
  }

  getMember(guildId: string, userId: string): MemberActivity | undefined {
    const row = this.query<ActivityRow>(
      'SELECT * FROM member_activity WHERE guild_id = ? AND user_id = ?',
      [guildId, userId],
    );
    return row ? mapMember(row) : undefined;
  }

  recordActivity(input: RecordActivityInput): RecordActivityResult {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.activityDate)) throw new Error('Invalid activity date.');
    return this.db.transaction(() => {
      const settings = this.getSettings(input.guildId);
      this.run('INSERT OR IGNORE INTO member_activity (guild_id, user_id) VALUES (?, ?)', [
        input.guildId,
        input.userId,
      ]);
      this.run(
        'INSERT OR IGNORE INTO activity_daily_totals (guild_id, user_id, activity_date) VALUES (?, ?, ?)',
        [input.guildId, input.userId, input.activityDate],
      );
      const before = this.getMember(input.guildId, input.userId)!;
      const daily = this.query<{ cnc_ping_awarded: number; replay_awards: number }>(
        `SELECT cnc_ping_awarded, replay_awards FROM activity_daily_totals
         WHERE guild_id = ? AND user_id = ? AND activity_date = ?`,
        [input.guildId, input.userId, input.activityDate],
      )!;
      const cncPingAwarded = settings.pingEnabled && input.hasCncPing && !daily.cnc_ping_awarded;
      let replaysAwarded = 0;
      if (settings.replayEnabled) {
        for (const fingerprint of new Set(input.replayFingerprints.slice(0, 10))) {
          if (daily.replay_awards + replaysAwarded >= settings.replayDailyCap) break;
          if (!/^[a-f0-9]{64}$/.test(fingerprint)) continue;
          const award = this.run(
            `INSERT OR IGNORE INTO activity_replay_awards
            (guild_id, user_id, fingerprint, activity_date) VALUES (?, ?, ?, ?)`,
            [input.guildId, input.userId, fingerprint, input.activityDate],
          );
          replaysAwarded += award.changes;
        }
      }
      const pointsAwarded =
        Number(cncPingAwarded) * settings.pingPoints + replaysAwarded * settings.replayPoints;
      if (pointsAwarded) {
        this.run(
          `UPDATE activity_daily_totals SET cnc_ping_awarded = MAX(cnc_ping_awarded, ?),
          replay_awards = replay_awards + ? WHERE guild_id = ? AND user_id = ? AND activity_date = ?`,
          [Number(cncPingAwarded), replaysAwarded, input.guildId, input.userId, input.activityDate],
        );
        this.run(
          `UPDATE member_activity SET points = MIN(1000000000, points + ?),
          qualifying_cnc_pings = qualifying_cnc_pings + ?, qualifying_replays = qualifying_replays + ?,
          last_cnc_ping_date = CASE WHEN ? = 1 THEN ? ELSE last_cnc_ping_date END,
          updated_at = CURRENT_TIMESTAMP WHERE guild_id = ? AND user_id = ?`,
          [
            pointsAwarded,
            Number(cncPingAwarded),
            replaysAwarded,
            Number(cncPingAwarded),
            input.activityDate,
            input.guildId,
            input.userId,
          ],
        );
      }
      return {
        before,
        after: this.getMember(input.guildId, input.userId)!,
        cncPingAwarded,
        replaysAwarded,
        pointsAwarded,
      };
    })();
  }

  getRankDefinitions(guildId: string): ActivityRankDefinition[] {
    this.initialize(guildId);
    return this.queryAll<{
      id: number;
      rank: number;
      title: string;
      role_id: string | null;
      threshold: number;
    }>('SELECT * FROM activity_rank_roles WHERE guild_id = ? ORDER BY rank', [guildId]).map(
      (row) => ({
        id: row.id,
        rank: row.rank,
        title: row.title,
        roleId: row.role_id ?? undefined,
        threshold: row.threshold,
      }),
    );
  }

  getRank(guildId: string, id: number): ActivityRankDefinition | undefined {
    return this.getRankDefinitions(guildId).find((rank) => rank.id === id);
  }

  private rescaleRanks(guildId: string): void {
    const settings = this.getSettings(guildId);
    const ranks = this.getRankDefinitions(guildId);
    if (
      settings.progressionMode === 'max_days' &&
      settings.maxRankDays * settings.pingPoints < ranks.length
    ) {
      throw new Error(
        'Increase days to the top rank or ping XP so every rank has a distinct threshold.',
      );
    }
    ranks.forEach((rank, index) => {
      const days =
        settings.progressionMode === 'per_rank'
          ? settings.daysPerRank * (index + 1)
          : (settings.maxRankDays * (index + 1)) / ranks.length;
      this.run('UPDATE activity_rank_roles SET threshold = ? WHERE id = ? AND guild_id = ?', [
        Math.ceil(days * settings.pingPoints),
        rank.id,
        guildId,
      ]);
    });
  }

  addRank(guildId: string, title: string, version: number): ActivityRankDefinition {
    return this.db.transaction(() => {
      this.assertVersion(guildId, version);
      const ranks = this.getRankDefinitions(guildId);
      if (ranks.length >= MAX_ACTIVITY_RANKS)
        throw new Error('A server can configure up to ' + MAX_ACTIVITY_RANKS + ' ranks.');
      const result = this.run(
        'INSERT INTO activity_rank_roles (guild_id, rank, title, threshold) VALUES (?, ?, ?, 0)',
        [guildId, ranks.length + 1, this.validateTitle(title)],
      );
      this.rescaleRanks(guildId);
      this.bumpVersion(guildId);
      return this.getRank(guildId, result.lastInsertRowid)!;
    })();
  }

  private validateTitle(title: string): string {
    const safeTitle = [...title]
      .filter((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
      .join('')
      .trim();
    if (!safeTitle || safeTitle.length > 80)
      throw new Error('Rank names must contain 1–80 characters.');
    return safeTitle;
  }

  editRank(guildId: string, id: number, title: string, threshold: number, version: number): void {
    this.db.transaction(() => {
      this.assertVersion(guildId, version);
      integer(threshold, 0, 1000000000, 'Rank XP');
      const ranks = this.getRankDefinitions(guildId);
      const index = ranks.findIndex((rank) => rank.id === id);
      if (index < 0) throw new Error('This rank no longer exists.');
      if (
        (index > 0 && threshold <= ranks[index - 1].threshold) ||
        (index < ranks.length - 1 && threshold >= ranks[index + 1].threshold)
      ) {
        throw new Error(
          'Rank XP must be higher than the previous rank and lower than the next rank.',
        );
      }
      this.run(
        'UPDATE activity_rank_roles SET title = ?, threshold = ? WHERE id = ? AND guild_id = ?',
        [this.validateTitle(title), threshold, id, guildId],
      );
      this.bumpVersion(guildId);
    })();
  }

  setRankRole(guildId: string, id: number, roleId: string | null, version: number): void {
    this.db.transaction(() => {
      this.assertVersion(guildId, version);
      const rank = this.getRank(guildId, id);
      if (!rank) throw new Error('This rank no longer exists.');
      if (roleId && !/^\d{17,20}$/.test(roleId)) throw new Error('Choose a valid role.');
      if (
        roleId &&
        this.getRankDefinitions(guildId).some((rank) => rank.id !== id && rank.roleId === roleId)
      ) {
        throw new Error('That role is already assigned to another rank.');
      }
      if (rank.roleId && rank.roleId !== roleId) {
        this.run('INSERT OR IGNORE INTO activity_retired_roles (guild_id, role_id) VALUES (?, ?)', [
          guildId,
          rank.roleId,
        ]);
      }
      this.run('UPDATE activity_rank_roles SET role_id = ? WHERE id = ? AND guild_id = ?', [
        roleId,
        id,
        guildId,
      ]);
      this.bumpVersion(guildId);
    })();
  }

  moveRank(guildId: string, id: number, direction: -1 | 1, version: number): void {
    this.db.transaction(() => {
      this.assertVersion(guildId, version);
      const ranks = this.getRankDefinitions(guildId);
      const index = ranks.findIndex((rank) => rank.id === id);
      const other = ranks[index + direction];
      if (index < 0 || !other) throw new Error('The rank cannot move any further.');
      const selected = ranks[index];
      this.run('UPDATE activity_rank_roles SET rank = 1000000 WHERE id = ?', [selected.id]);
      this.run('UPDATE activity_rank_roles SET rank = ?, threshold = ? WHERE id = ?', [
        selected.rank,
        selected.threshold,
        other.id,
      ]);
      this.run('UPDATE activity_rank_roles SET rank = ?, threshold = ? WHERE id = ?', [
        other.rank,
        other.threshold,
        selected.id,
      ]);
      this.bumpVersion(guildId);
    })();
  }

  removeRank(guildId: string, id: number, version: number): void {
    this.db.transaction(() => {
      this.assertVersion(guildId, version);
      const rank = this.getRank(guildId, id);
      if (!rank) throw new Error('This rank no longer exists.');
      if (rank.roleId)
        this.run('INSERT OR IGNORE INTO activity_retired_roles (guild_id, role_id) VALUES (?, ?)', [
          guildId,
          rank.roleId,
        ]);
      this.run('DELETE FROM activity_rank_roles WHERE id = ? AND guild_id = ?', [id, guildId]);
      this.getRankDefinitions(guildId).forEach((rank, index) => {
        this.run('UPDATE activity_rank_roles SET rank = ? WHERE id = ?', [index + 1, rank.id]);
      });
      this.rescaleRanks(guildId);
      this.bumpVersion(guildId);
    })();
  }

  getLeaderboard(guildId: string, limit = 10): MemberActivity[] {
    return this.queryAll<ActivityRow>(
      `SELECT * FROM member_activity WHERE guild_id = ? AND points > 0
      ORDER BY points DESC, updated_at ASC, user_id ASC LIMIT ?`,
      [guildId, Math.max(1, Math.min(25, Math.trunc(limit)))],
    ).map(mapMember);
  }

  getMemberPosition(guildId: string, userId: string): number | undefined {
    const member = this.getMember(guildId, userId);
    if (!member || !member.points) return undefined;
    return this.query<{ position: number }>(
      'SELECT COUNT(*) + 1 AS position FROM member_activity WHERE guild_id = ? AND points > ?',
      [guildId, member.points],
    )?.position;
  }

  getTrackedUserIds(guildId: string): string[] {
    return this.queryAll<{ user_id: string }>(
      'SELECT user_id FROM member_activity WHERE guild_id = ? ORDER BY user_id',
      [guildId],
    ).map((row) => row.user_id);
  }

  getRetiredRoleIds(guildId: string): string[] {
    return this.queryAll<{ role_id: string }>(
      'SELECT role_id FROM activity_retired_roles WHERE guild_id = ?',
      [guildId],
    ).map((row) => row.role_id);
  }

  adjustPoints(guildId: string, userId: string, amount: number): MemberActivity {
    integer(amount, -1000000, 1000000, 'XP adjustment');
    this.run('INSERT OR IGNORE INTO member_activity (guild_id, user_id) VALUES (?, ?)', [
      guildId,
      userId,
    ]);
    this.run(
      'UPDATE member_activity SET points = MIN(1000000000, MAX(0, points + ?)), updated_at = CURRENT_TIMESTAMP WHERE guild_id = ? AND user_id = ?',
      [amount, guildId, userId],
    );
    return this.getMember(guildId, userId)!;
  }

  resetMember(guildId: string, userId: string): void {
    // Keep daily claims and replay fingerprints so a reset cannot bypass award limits.
    this.run(
      `UPDATE member_activity SET points = 0, qualifying_cnc_pings = 0, qualifying_replays = 0,
      last_cnc_ping_date = NULL, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ? AND user_id = ?`,
      [guildId, userId],
    );
  }
}

export const activityRankRepository = new ActivityRankRepository();
