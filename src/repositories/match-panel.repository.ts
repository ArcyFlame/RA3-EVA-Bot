import { BaseRepository } from './base.repository';

export interface MatchPanel {
  guildId: string;
  channelId: string;
  messageId: string;
}

interface MatchPanelRow {
  guild_id: string;
  channel_id: string;
  message_id: string;
}

function mapRow(row: MatchPanelRow): MatchPanel {
  return { guildId: row.guild_id, channelId: row.channel_id, messageId: row.message_id };
}

const SELECT_COLUMNS = 'guild_id, channel_id, message_id';

export class MatchPanelRepository extends BaseRepository {
  get(guildId: string): MatchPanel | undefined {
    const row = this.query<MatchPanelRow>(
      `SELECT ${SELECT_COLUMNS} FROM match_panel_config WHERE guild_id = ?`,
      [guildId],
    );
    return row ? mapRow(row) : undefined;
  }

  set(guildId: string, channelId: string, messageId: string): void {
    this.run(
      'INSERT OR REPLACE INTO match_panel_config (guild_id, channel_id, message_id) VALUES (?, ?, ?)',
      [guildId, channelId, messageId],
    );
  }

  delete(guildId: string): void {
    this.run('DELETE FROM match_panel_config WHERE guild_id = ?', [guildId]);
  }

  getAll(): MatchPanel[] {
    return this.queryAll<MatchPanelRow>(`SELECT ${SELECT_COLUMNS} FROM match_panel_config`).map(
      mapRow,
    );
  }
}

export const matchPanelRepository = new MatchPanelRepository();
