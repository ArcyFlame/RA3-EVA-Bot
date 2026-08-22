import { BaseRepository } from './base.repository';

export interface User {
  discordId: string;
  username: string;
  globalName?: string;
  avatar?: string;
  shatabrickUsername?: string;
  ra3bUsername?: string;
  ra3bPersonaId?: number;
  rank: string;
  clanDmEnabled: number;
  tournamentDmEnabled: number;
  twitchDmEnabled: number;
  youtubeDmEnabled: number;
  tournamentMatchDmEnabled: number;
  clanInviteDmEnabled: number;
  refereeCheckinDmEnabled: number;
  language: string;
  createdAt: string;
  updatedAt: string;
}

export const SUPPORTED_LANGUAGES = ['en', 'ru', 'zh'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export class UserRepository extends BaseRepository {
  findByDiscordId(discordId: string): User | undefined {
    const row = this.query<{
      discordId: string;
      username: string;
      globalName: string | null;
      avatar: string | null;
      shatabrickUsername: string | null;
      rank: string;
      clanDmEnabled: number;
      tournamentDmEnabled: number;
      twitchDmEnabled: number;
      youtubeDmEnabled: number;
      tournamentMatchDmEnabled: number;
      clanInviteDmEnabled: number;
      refereeCheckinDmEnabled: number;
      ra3bUsername: string | null;
      ra3bPersonaId: number | null;
      language: string;
      createdAt: string;
      updatedAt: string;
    }>(
      'SELECT discord_id as discordId, username, global_name as globalName, avatar, ' +
        'shatabrick_username as shatabrickUsername, rank, ' +
        'clan_dm_enabled as clanDmEnabled, tournament_dm_enabled as tournamentDmEnabled, ' +
        'twitch_dm_enabled as twitchDmEnabled, youtube_dm_enabled as youtubeDmEnabled, ' +
        'tournament_match_dm_enabled as tournamentMatchDmEnabled, clan_invite_dm_enabled as clanInviteDmEnabled, ' +
        'referee_checkin_dm_enabled as refereeCheckinDmEnabled, ' +
        'ra3b_username as ra3bUsername, ra3b_persona_id as ra3bPersonaId, ' +
        'language, created_at as createdAt, updated_at as updatedAt FROM users WHERE discord_id = ?',
      [discordId],
    );
    if (!row) return undefined;
    return {
      ...row,
      globalName: row.globalName ?? undefined,
      avatar: row.avatar ?? undefined,
      shatabrickUsername: row.shatabrickUsername ?? undefined,
      ra3bUsername: row.ra3bUsername ?? undefined,
      ra3bPersonaId: row.ra3bPersonaId ?? undefined,
    };
  }

  upsertFromMember(
    discordId: string,
    username: string,
    globalName?: string,
    avatar?: string,
  ): void {
    const existing = this.findByDiscordId(discordId);
    if (existing) {
      this.run(
        `UPDATE users SET username = ?, global_name = ?, avatar = ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?`,
        [username, globalName, avatar, discordId],
      );
    } else {
      this.run(
        `INSERT INTO users (discord_id, username, global_name, avatar) VALUES (?, ?, ?, ?)`,
        [discordId, username, globalName, avatar],
      );
    }
  }

  // DM-setting methods hard-code column names instead of accepting SQL identifiers.

  /** Ensures a row exists so a flag toggle always persists (never a silent no-op). */
  private ensureUser(discordId: string): void {
    this.run('INSERT OR IGNORE INTO users (discord_id, username) VALUES (?, ?)', [
      discordId,
      'Unknown',
    ]);
  }

  setClanInviteDmEnabled(discordId: string, enabled: boolean): void {
    this.ensureUser(discordId);
    this.run(
      'UPDATE users SET clan_invite_dm_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?',
      [enabled ? 1 : 0, discordId],
    );
  }

  setTournamentMatchDmEnabled(discordId: string, enabled: boolean): void {
    this.ensureUser(discordId);
    this.run(
      'UPDATE users SET tournament_match_dm_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?',
      [enabled ? 1 : 0, discordId],
    );
  }

  setRank(discordId: string, rank: string): void {
    this.run(`UPDATE users SET rank = ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?`, [
      rank,
      discordId,
    ]);
  }

  linkShatabrick(discordId: string, shatabrickUsername: string): void {
    this.ensureUser(discordId);
    this.run(
      `UPDATE users SET shatabrick_username = ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?`,
      [shatabrickUsername, discordId],
    );
  }

  unlinkShatabrick(discordId: string): void {
    this.ensureUser(discordId);
    this.run(
      'UPDATE users SET shatabrick_username = NULL, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?',
      [discordId],
    );
  }

  /** Links the (separate) RA3BattleNet persona for /profile ladder lookups. */
  linkRa3BattleNet(discordId: string, ra3bUsername: string, personaId?: number): void {
    this.ensureUser(discordId);
    this.run(
      `UPDATE users SET ra3b_username = ?, ra3b_persona_id = ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?`,
      [ra3bUsername, personaId ?? null, discordId],
    );
  }

  unlinkRa3BattleNet(discordId: string): void {
    this.ensureUser(discordId);
    this.run(
      'UPDATE users SET ra3b_username = NULL, ra3b_persona_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?',
      [discordId],
    );
  }

  /** Clears linked game identities while preserving language and DM settings. */
  clearLinkedProfile(discordId: string): void {
    this.ensureUser(discordId);
    this.run(
      `UPDATE users
       SET shatabrick_username = NULL,
           ra3b_username = NULL,
           ra3b_persona_id = NULL,
           rank = 'Unranked',
           updated_at = CURRENT_TIMESTAMP
       WHERE discord_id = ?`,
      [discordId],
    );
  }

  setRefereeCheckinDmEnabled(discordId: string, enabled: boolean): void {
    this.ensureUser(discordId);
    this.run(
      'UPDATE users SET referee_checkin_dm_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?',
      [enabled ? 1 : 0, discordId],
    );
  }

  isRefereeCheckinDmEnabled(discordId: string): boolean {
    return (this.findByDiscordId(discordId)?.refereeCheckinDmEnabled ?? 1) !== 0;
  }

  /** Resolves a user's language, defaulting to English for unknown users. */
  getLanguage(discordId: string): Language {
    const user = this.findByDiscordId(discordId);
    const lang = user?.language as Language | undefined;
    return lang && (SUPPORTED_LANGUAGES as readonly string[]).includes(lang) ? lang : 'en';
  }

  setLanguage(discordId: string, language: Language): void {
    this.ensureUser(discordId);
    this.run(
      `UPDATE users SET language = ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?`,
      [language, discordId],
    );
  }
}

export const userRepository = new UserRepository();
