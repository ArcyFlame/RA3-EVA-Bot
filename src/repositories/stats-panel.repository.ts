import { BaseRepository } from './base.repository';

export interface StatsPanel {
  guildId: string;
  channelId: string | null;
  messageId: string | null;
  chartsMessageId: string | null;
  currentPage: number;
  mode: string;
}

interface StatsPanelRow {
  guild_id: string;
  channel_id: string | null;
  message_id: string | null;
  charts_message_id: string | null;
  current_page: number | null;
  mode: string | null;
}

function mapRow(row: StatsPanelRow): StatsPanel {
  return {
    guildId: row.guild_id,
    channelId: row.channel_id ?? null,
    messageId: row.message_id ?? null,
    chartsMessageId: row.charts_message_id ?? null,
    currentPage: row.current_page ?? 0,
    mode: row.mode ?? '1v1',
  };
}

const SELECT_COLUMNS = 'guild_id, channel_id, message_id, charts_message_id, current_page, mode';

/**
 * Single source of truth for `stats_panel_config`. Unlike the previous
 * `INSERT OR REPLACE` (which wiped `message_id`/`current_page` because
 * `guild_id` is the primary key), writes here only touch the intended column.
 */
export class StatsPanelRepository extends BaseRepository {
  get(guildId: string): StatsPanel | undefined {
    const row = this.query<StatsPanelRow>(
      `SELECT ${SELECT_COLUMNS} FROM stats_panel_config WHERE guild_id = ?`,
      [guildId],
    );
    return row ? mapRow(row) : undefined;
  }

  getByMessageId(messageId: string): StatsPanel | undefined {
    const row = this.query<StatsPanelRow>(
      `SELECT ${SELECT_COLUMNS} FROM stats_panel_config WHERE message_id = ?`,
      [messageId],
    );
    return row ? mapRow(row) : undefined;
  }

  getAll(): StatsPanel[] {
    return this.queryAll<StatsPanelRow>(`SELECT ${SELECT_COLUMNS} FROM stats_panel_config`).map(
      mapRow,
    );
  }

  /** Sets the channel while preserving the existing panel message + page. */
  setChannel(guildId: string, channelId: string): void {
    this.run(
      `INSERT INTO stats_panel_config (guild_id, channel_id) VALUES (?, ?)
       ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id`,
      [guildId, channelId],
    );
  }

  /** Creates/replaces a full panel (new message → page resets to 0). */
  setPanel(guildId: string, channelId: string, messageId: string): void {
    this.run(
      `INSERT INTO stats_panel_config (guild_id, channel_id, message_id, current_page) VALUES (?, ?, ?, 0)
       ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id, message_id = excluded.message_id, current_page = 0`,
      [guildId, channelId, messageId],
    );
  }

  setPageByMessageId(messageId: string, page: number): void {
    this.run('UPDATE stats_panel_config SET current_page = ? WHERE message_id = ?', [
      page,
      messageId,
    ]);
  }

  setModeByMessageId(messageId: string, mode: string): void {
    this.run('UPDATE stats_panel_config SET mode = ? WHERE message_id = ?', [mode, messageId]);
  }

  updateMessageId(guildId: string, messageId: string): void {
    this.run('UPDATE stats_panel_config SET message_id = ? WHERE guild_id = ?', [
      messageId,
      guildId,
    ]);
  }

  updateChartsMessageId(guildId: string, messageId: string): void {
    this.run('UPDATE stats_panel_config SET charts_message_id = ? WHERE guild_id = ?', [
      messageId,
      guildId,
    ]);
  }

  delete(guildId: string): void {
    this.run('DELETE FROM stats_panel_config WHERE guild_id = ?', [guildId]);
  }
}

export const statsPanelRepository = new StatsPanelRepository();
