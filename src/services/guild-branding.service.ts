import { Client, Guild } from 'discord.js';
import { createHash } from 'node:crypto';
import { db } from '../database/sqlite';
import { GameId, GAME_CONFIGS } from '../config/games';
import { guildRepository } from '../repositories/guild.repository';
import { sourceGet } from '../utils/safe-fetch';
import { logger } from '../utils/logger';

interface BrandingState {
  game: GameId;
  source: string;
}
const PNG_HEADER = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Changes only the bot's own server profile, never its global profile or the server artwork. */
export class GuildBrandingService {
  private pending = new Map<string, Promise<boolean>>();
  private assets = new Map<string, Buffer>();
  private profileChanges = new Map<string, Promise<unknown>>();

  exclusive<T>(guildId: string, action: () => Promise<T>): Promise<T> {
    const previous = this.profileChanges.get(guildId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(action);
    this.profileChanges.set(guildId, next);
    void next
      .finally(() => {
        if (this.profileChanges.get(guildId) === next) this.profileChanges.delete(guildId);
      })
      .catch(() => undefined);
    return next;
  }

  apply(guild: Guild, game: GameId): Promise<boolean> {
    const pending = this.pending.get(guild.id);
    if (pending) return pending.then(() => this.apply(guild, game));
    const action = this.exclusive(guild.id, () => this.update(guild, game)).finally(() =>
      this.pending.delete(guild.id),
    );
    this.pending.set(guild.id, action);
    return action;
  }

  async reconcile(client: Client): Promise<void> {
    for (const settings of guildRepository.getAllGuilds()) {
      const guild = client.guilds.cache.get(settings.discordId);
      if (guild) await this.apply(guild, settings.game);
    }
  }

  private async update(guild: Guild, game: GameId): Promise<boolean> {
    try {
      const key = `guild_branding:${guild.id}`;
      const manualRow = db
        .prepare('SELECT value FROM app_settings WHERE key=?')
        .get(`manual_guild_profile:${guild.id}`) as { value: string } | undefined;
      let manual: { avatar?: boolean; banner?: boolean } = {};
      try {
        manual = manualRow ? JSON.parse(manualRow.value) : {};
      } catch {
        /* Ignore invalid optional state. */
      }
      if (manual.avatar && manual.banner) return true;
      const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
        | { value: string }
        | undefined;
      let previous: BrandingState | undefined;
      try {
        previous = row ? JSON.parse(row.value) : undefined;
      } catch {
        /* Invalid optional state is repaired after a successful profile update. */
      }
      const url = GAME_CONFIGS[game].guildProfileArtworkUrl;
      if (!url) {
        // RA3 keeps the owner's existing global avatar/banner. Clear only overrides we managed.
        if (previous?.game === 'genevo') {
          await guild.members.editMe({
            ...(!manual.avatar ? { avatar: null } : {}),
            ...(!manual.banner ? { banner: null } : {}),
          });
          db.prepare('DELETE FROM app_settings WHERE key = ?').run(key);
        }
        return true;
      }
      const source = createHash('sha256').update(url).digest('hex');
      if (previous?.game === game && previous.source === source) return true;
      let image = this.assets.get(url);
      if (!image) {
        const response = await sourceGet<ArrayBuffer>(url, {
          responseType: 'arraybuffer',
          timeout: 10000,
        });
        image = Buffer.from(response.data);
        if (
          image.length > 2 * 1024 * 1024 ||
          image.length < 24 ||
          !image.subarray(0, 8).equals(PNG_HEADER) ||
          image.readUInt32BE(16) === 0 ||
          image.readUInt32BE(20) === 0 ||
          image.readUInt32BE(16) > 4096 ||
          image.readUInt32BE(20) > 4096
        )
          throw new Error('Invalid or oversized configured profile artwork');
        this.assets.set(url, image);
      }
      if (guildRepository.findByDiscordId(guild.id)?.game !== game) return false;
      await guild.members.editMe({
        ...(!manual.avatar ? { avatar: image } : {}),
        ...(!manual.banner ? { banner: image } : {}),
      });
      db.prepare(
        `INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`,
      ).run(key, JSON.stringify({ game, source } satisfies BrandingState));
      logger.info(`Applied ${game} bot avatar and banner for guild ${guild.id}`);
      return true;
    } catch (error) {
      logger.warn(`Could not apply ${game} bot profile for guild ${guild.id}:`, error);
      return false;
    }
  }
}

export const guildBrandingService = new GuildBrandingService();
