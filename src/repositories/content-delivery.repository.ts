import { BaseRepository } from './base.repository';

export class ContentDeliveryRepository extends BaseRepository {
  wasDelivered(guildId: string, source: string, itemKey: string, channelId?: string): boolean {
    const sql = channelId
      ? 'SELECT item_key FROM content_deliveries WHERE guild_id = ? AND source = ? AND item_key = ? AND channel_id = ?'
      : 'SELECT item_key FROM content_deliveries WHERE guild_id = ? AND source = ? AND item_key = ?';
    return !!this.query<{ item_key: string }>(
      sql,
      channelId ? [guildId, source, itemKey, channelId] : [guildId, source, itemKey],
    );
  }

  hasAnyDelivery(guildId: string, source: string, channelId: string): boolean {
    return !!this.query<{ item_key: string }>(
      'SELECT item_key FROM content_deliveries WHERE guild_id = ? AND source = ? AND channel_id = ? LIMIT 1',
      [guildId, source, channelId],
    );
  }

  markDelivered(guildId: string, source: string, itemKey: string, channelId: string): void {
    this.run(
      `INSERT OR REPLACE INTO content_deliveries
         (guild_id, source, item_key, channel_id, delivered_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [guildId, source, itemKey, channelId],
    );
  }
}

export const contentDeliveryRepository = new ContentDeliveryRepository();
