import { BaseRepository } from './base.repository';
import { GameId, normalizeGame } from '../config/games';

export interface Guild {
  discordId: string;
  prefix: string;
  adminRoleId?: string;
  refereeRoleId?: string;
  clansEnabled: number;
  tournamentsEnabled: number;
  profilesEnabled: number;
  twitchNotifierEnabled: number;
  youtubeNotifierEnabled: number;
  moddbNotifierEnabled: number;
  moderationEnabled: number;
  lobbyEnabled: number;
  statsAutoUpdateEnabled: number;
  welcomeEnabled: number;
  clanChannelId?: string;
  tournamentDisputesChannelId?: string;
  twitchChannelId?: string;
  youtubeChannelId?: string;
  tournamentEventsChannelId?: string;
  moddbChannelId?: string;
  lobbyChannelId?: string;
  statsPanelEnabled: number;
  statsPanelChannelId?: string;
  statsPanelMessageId?: string;
  statsPanelInterval: number;
  menusEnabled: number;
  newsEnabled: number;
  newsChannelId?: string;
  /** Which supported game this server runs. */
  game: GameId;
  cncOnlineEnabled: number;
  ra3BattleNetEnabled: number;
  /** JSON array of help-category values hidden from /help on this server. */
  hiddenHelpCategories?: string;
  createdAt: string;
  updatedAt: string;
}

/** Whitelisted notification-channel columns — the ONLY columns dynamic updates may touch. */
const NOTIFY_CHANNEL_COLUMNS: Record<string, string> = {
  clan: 'clan_channel_id',
  tournament: 'tournament_disputes_channel_id',
  twitch: 'twitch_channel_id',
  youtube: 'youtube_channel_id',
  tournament_events: 'tournament_events_channel_id',
  moddb: 'moddb_channel_id',
  lobby: 'lobby_channel_id',
  news: 'news_channel_id',
};

/** Whitelisted feature-toggle columns. */
const FEATURE_COLUMNS: Record<string, string> = {
  clans: 'clans_enabled',
  tournaments: 'tournaments_enabled',
  profiles: 'profiles_enabled',
  twitchNotifier: 'twitch_notifier_enabled',
  youtubeNotifier: 'youtube_notifier_enabled',
  moddbNotifier: 'moddb_notifier_enabled',
  moderation: 'moderation_enabled',
  lobby: 'lobby_enabled',
  statsAutoUpdate: 'stats_auto_update_enabled',
  welcome: 'welcome_enabled',
  news: 'news_enabled',
  cncOnline: 'cnc_online_enabled',
  ra3BattleNet: 'ra3battle_net_enabled',
};

export class GuildRepository extends BaseRepository {
  findByDiscordId(discordId: string): Guild | undefined {
    const row = this.query<any>('SELECT * FROM guilds WHERE discord_id = ?', [discordId]);
    if (!row) return undefined;
    return this.mapRowToGuild(row);
  }

  getAllGuilds(): Guild[] {
    const rows = this.queryAll<any>('SELECT * FROM guilds');
    return rows.map((row) => this.mapRowToGuild(row));
  }

  private mapRowToGuild(row: any): Guild {
    return {
      discordId: row.discord_id,
      prefix: row.prefix,
      adminRoleId: row.admin_role_id,
      refereeRoleId: row.referee_role_id,
      clansEnabled: row.clans_enabled,
      tournamentsEnabled: row.tournaments_enabled,
      profilesEnabled: row.profiles_enabled,
      twitchNotifierEnabled: row.twitch_notifier_enabled,
      youtubeNotifierEnabled: row.youtube_notifier_enabled,
      moddbNotifierEnabled: row.moddb_notifier_enabled,
      moderationEnabled: row.moderation_enabled ?? 1,
      lobbyEnabled: row.lobby_enabled ?? 1,
      statsAutoUpdateEnabled: row.stats_auto_update_enabled ?? 1,
      welcomeEnabled: row.welcome_enabled ?? 1,
      clanChannelId: row.clan_channel_id,
      tournamentDisputesChannelId: row.tournament_disputes_channel_id,
      twitchChannelId: row.twitch_channel_id,
      youtubeChannelId: row.youtube_channel_id,
      tournamentEventsChannelId: row.tournament_events_channel_id,
      moddbChannelId: row.moddb_channel_id,
      lobbyChannelId: row.lobby_channel_id,
      statsPanelEnabled: row.stats_panel_enabled,
      statsPanelChannelId: row.stats_panel_channel_id,
      statsPanelMessageId: row.stats_panel_message_id,
      statsPanelInterval: row.stats_panel_interval,
      menusEnabled: row.menus_enabled ?? 1,
      newsEnabled: row.news_enabled ?? 1,
      newsChannelId: row.news_channel_id,
      game: normalizeGame(row.game),
      cncOnlineEnabled: row.cnc_online_enabled ?? 1,
      ra3BattleNetEnabled: row.ra3battle_net_enabled ?? 1,
      hiddenHelpCategories: row.hidden_help_categories,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  upsert(discordId: string, data: Partial<Guild>): void {
    const existing = this.findByDiscordId(discordId);
    if (existing) {
      this.run(
        `UPDATE guilds SET 
          prefix = COALESCE(?, prefix),
          admin_role_id = COALESCE(?, admin_role_id),
          referee_role_id = COALESCE(?, referee_role_id),
          clans_enabled = COALESCE(?, clans_enabled),
          tournaments_enabled = COALESCE(?, tournaments_enabled),
          profiles_enabled = COALESCE(?, profiles_enabled),
          twitch_notifier_enabled = COALESCE(?, twitch_notifier_enabled),
          youtube_notifier_enabled = COALESCE(?, youtube_notifier_enabled),
          moddb_notifier_enabled = COALESCE(?, moddb_notifier_enabled),
          moderation_enabled = COALESCE(?, moderation_enabled),
          lobby_enabled = COALESCE(?, lobby_enabled),
          stats_auto_update_enabled = COALESCE(?, stats_auto_update_enabled),
          welcome_enabled = COALESCE(?, welcome_enabled),
          clan_channel_id = COALESCE(?, clan_channel_id),
          tournament_disputes_channel_id = COALESCE(?, tournament_disputes_channel_id),
          twitch_channel_id = COALESCE(?, twitch_channel_id),
          youtube_channel_id = COALESCE(?, youtube_channel_id),
          tournament_events_channel_id = COALESCE(?, tournament_events_channel_id),
          moddb_channel_id = COALESCE(?, moddb_channel_id),
          lobby_channel_id = COALESCE(?, lobby_channel_id),
          stats_panel_enabled = COALESCE(?, stats_panel_enabled),
          stats_panel_channel_id = COALESCE(?, stats_panel_channel_id),
          stats_panel_message_id = COALESCE(?, stats_panel_message_id),
          stats_panel_interval = COALESCE(?, stats_panel_interval),
          game = COALESCE(?, game),
          cnc_online_enabled = COALESCE(?, cnc_online_enabled),
          ra3battle_net_enabled = COALESCE(?, ra3battle_net_enabled),
          updated_at = CURRENT_TIMESTAMP
        WHERE discord_id = ?`,
        [
          data.prefix,
          data.adminRoleId,
          data.refereeRoleId,
          data.clansEnabled,
          data.tournamentsEnabled,
          data.profilesEnabled,
          data.twitchNotifierEnabled,
          data.youtubeNotifierEnabled,
          data.moddbNotifierEnabled,
          data.moderationEnabled,
          data.lobbyEnabled,
          data.statsAutoUpdateEnabled,
          data.welcomeEnabled,
          data.clanChannelId,
          data.tournamentDisputesChannelId,
          data.twitchChannelId,
          data.youtubeChannelId,
          data.tournamentEventsChannelId,
          data.moddbChannelId,
          data.lobbyChannelId,
          data.statsPanelEnabled,
          data.statsPanelChannelId,
          data.statsPanelMessageId,
          data.statsPanelInterval,
          data.game,
          data.cncOnlineEnabled,
          data.ra3BattleNetEnabled,
          discordId,
        ],
      );
    } else {
      this.run(
        `INSERT INTO guilds (
          discord_id, prefix, admin_role_id, referee_role_id,
          clans_enabled, tournaments_enabled, profiles_enabled,
          twitch_notifier_enabled, youtube_notifier_enabled, moddb_notifier_enabled,
          moderation_enabled, lobby_enabled, stats_auto_update_enabled, welcome_enabled,
          clan_channel_id, tournament_disputes_channel_id, twitch_channel_id,
          youtube_channel_id, tournament_events_channel_id, moddb_channel_id, lobby_channel_id,
          stats_panel_enabled, stats_panel_channel_id, stats_panel_message_id, stats_panel_interval,
          game, cnc_online_enabled, ra3battle_net_enabled
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          discordId,
          data.prefix || '!',
          data.adminRoleId,
          data.refereeRoleId,
          data.clansEnabled ?? 0,
          data.tournamentsEnabled ?? 1,
          data.profilesEnabled ?? 1,
          data.twitchNotifierEnabled ?? 1,
          data.youtubeNotifierEnabled ?? 1,
          data.moddbNotifierEnabled ?? 1,
          data.moderationEnabled ?? 1,
          data.lobbyEnabled ?? 1,
          data.statsAutoUpdateEnabled ?? 1,
          data.welcomeEnabled ?? 1,
          data.clanChannelId,
          data.tournamentDisputesChannelId,
          data.twitchChannelId,
          data.youtubeChannelId,
          data.tournamentEventsChannelId,
          data.moddbChannelId,
          data.lobbyChannelId,
          data.statsPanelEnabled ?? 0,
          data.statsPanelChannelId,
          data.statsPanelMessageId,
          data.statsPanelInterval ?? 10,
          data.game ?? 'ra3',
          data.cncOnlineEnabled ?? 1,
          data.ra3BattleNetEnabled ?? 1,
        ],
      );
    }
  }

  updateNotifyChannel(discordId: string, category: string, channelId: string | null): void {
    const column = NOTIFY_CHANNEL_COLUMNS[category];
    if (!column) {
      // Programmer error, not user error — fail loudly so it surfaces in dev.
      throw new Error(`updateNotifyChannel: unknown category "${category}"`);
    }
    this.run(
      `UPDATE guilds SET ${column} = ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?`,
      [channelId, discordId],
    );
  }

  toggleFeature(discordId: string, feature: string, enabled: boolean): void {
    const column = FEATURE_COLUMNS[feature];
    if (!column) {
      throw new Error(`toggleFeature: unknown feature "${feature}"`);
    }
    this.run(
      `UPDATE guilds SET ${column} = ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?`,
      [enabled ? 1 : 0, discordId],
    );
  }

  setStatsPanel(
    discordId: string,
    channelId: string | null,
    enabled: boolean,
    messageId?: string,
  ): void {
    this.run(
      `UPDATE guilds SET stats_panel_enabled = ?, stats_panel_channel_id = ?, stats_panel_message_id = ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?`,
      [enabled ? 1 : 0, channelId, messageId || null, discordId],
    );
  }

  /** Guild-wide preference: interactive menus (1) or plain command lists (0). */
  setMenusEnabled(discordId: string, enabled: boolean): void {
    this.run(
      `UPDATE guilds SET menus_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?`,
      [enabled ? 1 : 0, discordId],
    );
  }

  setGame(discordId: string, game: GameId): void {
    this.run(
      `UPDATE guilds
       SET game = ?,
           cnc_online_enabled = 1,
           ra3battle_net_enabled = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE discord_id = ?`,
      [game, 1, discordId],
    );
  }

  getHiddenHelpCategories(discordId: string): string[] {
    const row = this.query<{ hidden: string | null }>(
      'SELECT hidden_help_categories as hidden FROM guilds WHERE discord_id = ?',
      [discordId],
    );
    if (!row?.hidden) return [];
    try {
      const parsed = JSON.parse(row.hidden);
      return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
    } catch {
      return [];
    }
  }

  setHiddenHelpCategories(discordId: string, categories: string[]): void {
    this.run(
      `UPDATE guilds SET hidden_help_categories = ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?`,
      [JSON.stringify(categories.slice(0, 10)), discordId],
    );
  }
}

export const guildRepository = new GuildRepository();
