import { BaseRepository } from './base.repository';

export interface LobbyPanel {
  guildId: string;
  channelId: string;
  messageId: string;
}

interface LobbyPanelRow {
  guild_id: string;
  channel_id: string;
  message_id: string;
}

function mapRow(row: LobbyPanelRow): LobbyPanel {
  return { guildId: row.guild_id, channelId: row.channel_id, messageId: row.message_id };
}

const SELECT_COLUMNS = 'guild_id, channel_id, message_id';

export class LobbyPanelRepository extends BaseRepository {
  get(guildId: string): LobbyPanel | undefined {
    const row = this.query<LobbyPanelRow>(
      `SELECT ${SELECT_COLUMNS} FROM lobby_panel_config WHERE guild_id = ?`,
      [guildId],
    );
    return row ? mapRow(row) : undefined;
  }

  set(guildId: string, channelId: string, messageId: string): void {
    this.run(
      'INSERT OR REPLACE INTO lobby_panel_config (guild_id, channel_id, message_id) VALUES (?, ?, ?)',
      [guildId, channelId, messageId],
    );
  }

  delete(guildId: string): void {
    this.run('DELETE FROM lobby_panel_config WHERE guild_id = ?', [guildId]);
  }

  getAll(): LobbyPanel[] {
    return this.queryAll<LobbyPanelRow>(`SELECT ${SELECT_COLUMNS} FROM lobby_panel_config`).map(
      mapRow,
    );
  }
}

export const lobbyPanelRepository = new LobbyPanelRepository();
