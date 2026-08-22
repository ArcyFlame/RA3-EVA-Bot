import { BaseRepository } from './base.repository';

export interface TrackedStreamer {
  id: number;
  guildId: string;
  platform: 'twitch' | 'youtube';
  platformId: string;
  displayName: string;
  customMessage?: string;
  addedAt: string;
}

interface TrackedStreamerRow {
  id: number;
  guild_id: string;
  platform: string;
  platform_id: string;
  display_name: string;
  custom_message: string | null;
  added_at: string;
}

function mapRow(row: TrackedStreamerRow): TrackedStreamer {
  return {
    id: row.id,
    guildId: row.guild_id,
    platform: row.platform as 'twitch' | 'youtube',
    platformId: row.platform_id,
    displayName: row.display_name,
    customMessage: row.custom_message ?? undefined,
    addedAt: row.added_at,
  };
}

const SELECT_COLUMNS =
  'id, guild_id, platform, platform_id, display_name, custom_message, added_at';

export class TrackedStreamerRepository extends BaseRepository {
  findByGuild(guildId: string): TrackedStreamer[] {
    return this.queryAll<TrackedStreamerRow>(
      `SELECT ${SELECT_COLUMNS} FROM tracked_streamers WHERE guild_id = ? ORDER BY platform, display_name`,
      [guildId],
    ).map(mapRow);
  }

  findByPlatformId(platformId: string): TrackedStreamer[] {
    return this.queryAll<TrackedStreamerRow>(
      `SELECT ${SELECT_COLUMNS} FROM tracked_streamers WHERE platform_id = ?`,
      [platformId],
    ).map(mapRow);
  }

  findAll(): TrackedStreamer[] {
    return this.queryAll<TrackedStreamerRow>(`SELECT ${SELECT_COLUMNS} FROM tracked_streamers`).map(
      mapRow,
    );
  }

  addStreamer(
    guildId: string,
    platform: 'twitch' | 'youtube',
    platformId: string,
    displayName: string,
    customMessage?: string,
  ): void {
    this.run(
      `INSERT OR REPLACE INTO tracked_streamers (guild_id, platform, platform_id, display_name, custom_message)
       VALUES (?, ?, ?, ?, ?)`,
      [guildId, platform, platformId, displayName, customMessage || null],
    );
  }

  removeStreamer(guildId: string, platformId: string): boolean {
    const result = this.run(
      'DELETE FROM tracked_streamers WHERE guild_id = ? AND platform_id = ?',
      [guildId, platformId],
    );
    return result.changes > 0;
  }

  countByPlatformId(platformId: string): number {
    const row = this.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM tracked_streamers WHERE platform_id = ?',
      [platformId],
    );
    return row?.count || 0;
  }
}

export const trackedStreamerRepository = new TrackedStreamerRepository();
