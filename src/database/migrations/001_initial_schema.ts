import { db, addColumnIfMissing } from '../sqlite';

export function up(): void {
  db.exec(`
    -- Guilds table (core configuration)
    CREATE TABLE IF NOT EXISTS guilds (
      discord_id TEXT PRIMARY KEY,
      prefix TEXT DEFAULT '!',
      admin_role_id TEXT,
      referee_role_id TEXT,
      clans_enabled INTEGER DEFAULT 0,
      tournaments_enabled INTEGER DEFAULT 1,
      profiles_enabled INTEGER DEFAULT 1,
      twitch_notifier_enabled INTEGER DEFAULT 1,
      youtube_notifier_enabled INTEGER DEFAULT 1,
      moddb_notifier_enabled INTEGER DEFAULT 1,
      moderation_enabled INTEGER DEFAULT 1,
      lobby_enabled INTEGER DEFAULT 1,
      stats_auto_update_enabled INTEGER DEFAULT 1,
      welcome_enabled INTEGER DEFAULT 1,
      clan_channel_id TEXT,
      tournament_disputes_channel_id TEXT,
      twitch_channel_id TEXT,
      youtube_channel_id TEXT,
      tournament_events_channel_id TEXT,
      moddb_channel_id TEXT,
      lobby_channel_id TEXT,
      stats_panel_enabled INTEGER DEFAULT 0,
      stats_panel_channel_id TEXT,
      stats_panel_message_id TEXT,
      stats_panel_interval INTEGER DEFAULT 10,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      discord_id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      global_name TEXT,
      avatar TEXT,
      shatabrick_username TEXT,
      rank TEXT DEFAULT 'Unranked',
      clan_dm_enabled INTEGER DEFAULT 1,
      tournament_dm_enabled INTEGER DEFAULT 1,
      twitch_dm_enabled INTEGER DEFAULT 1,
      youtube_dm_enabled INTEGER DEFAULT 1,
      tournament_match_dm_enabled INTEGER DEFAULT 1,
      clan_invite_dm_enabled INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Warnings table
    CREATE TABLE IF NOT EXISTS warnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Clans table
    CREATE TABLE IF NOT EXISTS clans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      tag TEXT UNIQUE NOT NULL,
      owner_id TEXT NOT NULL,
      approved INTEGER DEFAULT 0,
      color INTEGER,
      max_members INTEGER DEFAULT 50,
      is_private INTEGER DEFAULT 0,
      description TEXT,
      role_id TEXT,
      text_channel_id TEXT,
      voice_channel_id TEXT,
      shatabrick_clan_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Clan members
    CREATE TABLE IF NOT EXISTS clan_members (
      clan_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (clan_id, user_id),
      FOREIGN KEY (clan_id) REFERENCES clans(id) ON DELETE CASCADE
    );

    -- Clan join requests
    CREATE TABLE IF NOT EXISTS clan_join_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clan_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      message TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (clan_id) REFERENCES clans(id) ON DELETE CASCADE
    );

    -- Tracked streamers (Twitch/YouTube)
    CREATE TABLE IF NOT EXISTS tracked_streamers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      platform_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      custom_message TEXT,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(guild_id, platform_id)
    );

    -- Tournament events (from GameReplays)
    CREATE TABLE IF NOT EXISTS tournament_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_url TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      announced_at DATETIME NOT NULL,
      format TEXT,
      prize_pool TEXT,
      maps TEXT,
      start_date DATETIME,
      announcement_channel_id TEXT,
      announcement_message_id TEXT
    );

    -- Tournament registrations
    CREATE TABLE IF NOT EXISTS tournament_registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      registered_at DATETIME NOT NULL,
      FOREIGN KEY (event_id) REFERENCES tournament_events(id) ON DELETE CASCADE,
      UNIQUE(event_id, user_id)
    );

    -- Tournament results
    CREATE TABLE IF NOT EXISTS tournament_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_url TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      announced_at DATETIME NOT NULL,
      challonge_url TEXT,
      replay_pack_url TEXT,
      bracket_image_url TEXT
    );

    -- Tournament votes
    CREATE TABLE IF NOT EXISTS tournament_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      result_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      vote INTEGER NOT NULL,
      voted_at DATETIME NOT NULL,
      FOREIGN KEY (result_id) REFERENCES tournament_results(id) ON DELETE CASCADE,
      UNIQUE(result_id, user_id)
    );

    -- Tournament cache (linked Challonge tournament per guild)
    CREATE TABLE IF NOT EXISTS tournament_cache (
      guild_id TEXT PRIMARY KEY NOT NULL,
      tournament_url TEXT,
      tournament_id TEXT,
      custom_event_url TEXT
    );

    -- Tournament matches (reported by users)
    CREATE TABLE IF NOT EXISTS tournament_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      round INTEGER DEFAULT 1,
      player1_id TEXT NOT NULL,
      player2_id TEXT NOT NULL,
      player1_score INTEGER DEFAULT 0,
      player2_score INTEGER DEFAULT 0,
      winner_id TEXT,
      reported_by TEXT,
      proof_url TEXT,
      status TEXT DEFAULT 'pending',
      challonge_match_id TEXT,
      player1_faction TEXT,
      player2_faction TEXT,
      reported_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Tournament match confirmations (reminders, delays)
    CREATE TABLE IF NOT EXISTS tournament_match_confirmations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      tournament_id INTEGER NOT NULL,
      challonge_match_id TEXT NOT NULL,
      player1_id TEXT NOT NULL,
      player2_id TEXT NOT NULL,
      scheduled_time DATETIME,
      reminder_sent INTEGER DEFAULT 0,
      player1_confirmed INTEGER DEFAULT 0,
      player2_confirmed INTEGER DEFAULT 0,
      player1_delay INTEGER,
      player2_delay INTEGER,
      UNIQUE(guild_id, tournament_id, challonge_match_id)
    );

    -- Masters Hall of Fame
    CREATE TABLE IF NOT EXISTS masters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      year INTEGER NOT NULL,
      patch TEXT,
      added_by TEXT,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Tournament winners (cached for stats)
    CREATE TABLE IF NOT EXISTS tournament_winners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_url TEXT UNIQUE NOT NULL,
      winner_name TEXT NOT NULL,
      recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Map play history (for statistics)
    CREATE TABLE IF NOT EXISTS map_play_history (
      map_name TEXT NOT NULL,
      platform TEXT NOT NULL,
      games_count INTEGER DEFAULT 0,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (map_name, platform)
    );

    -- ModDB notified items (to avoid duplicates)
    CREATE TABLE IF NOT EXISTS moddb_notified (
      url TEXT PRIMARY KEY,
      content_type TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Twitch notified streams (to avoid duplicate notifications)
    CREATE TABLE IF NOT EXISTS twitch_notified_streams (
      broadcaster_id TEXT PRIMARY KEY,
      notified_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Stats panel configuration (persistent auto‑updating panel)
    CREATE TABLE IF NOT EXISTS stats_panel_config (
      guild_id TEXT PRIMARY KEY,
      channel_id TEXT,
      message_id TEXT,
      current_page INTEGER DEFAULT 0,
      update_interval INTEGER DEFAULT 10
    );

    -- Lobby panel configuration (persistent lobby board)
    CREATE TABLE IF NOT EXISTS lobby_panel_config (
      guild_id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL
    );

    -- Match panel configuration (persistent tournament match ticker)
    CREATE TABLE IF NOT EXISTS match_panel_config (
      guild_id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL
    );

    -- Build orders (user‑saved strategies)
    CREATE TABLE IF NOT EXISTS build_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, name)
    );
  `);

  // Add missing columns to guilds table (idempotent — safe on fresh and legacy DBs)
  addColumnIfMissing('guilds', 'lobby_channel_id', 'TEXT');
  addColumnIfMissing('guilds', 'moderation_enabled', 'INTEGER DEFAULT 1');
  addColumnIfMissing('guilds', 'lobby_enabled', 'INTEGER DEFAULT 1');
  addColumnIfMissing('guilds', 'stats_auto_update_enabled', 'INTEGER DEFAULT 1');
  addColumnIfMissing('guilds', 'welcome_enabled', 'INTEGER DEFAULT 1');
  addColumnIfMissing('stats_panel_config', 'current_page', 'INTEGER DEFAULT 0');
}

export function down(): void {
  const tables = [
    'build_orders',
    'match_panel_config',
    'lobby_panel_config',
    'stats_panel_config',
    'twitch_notified_streams',
    'moddb_notified',
    'map_play_history',
    'tournament_winners',
    'masters',
    'tournament_match_confirmations',
    'tournament_matches',
    'tournament_cache',
    'tournament_votes',
    'tournament_results',
    'tournament_registrations',
    'tournament_events',
    'tracked_streamers',
    'clan_join_requests',
    'clan_members',
    'clans',
    'warnings',
    'users',
    'guilds',
  ];
  for (const table of tables) {
    db.exec(`DROP TABLE IF EXISTS ${table}`);
  }
}
