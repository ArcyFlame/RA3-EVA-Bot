import { EmbedBuilder } from 'discord.js';
import { CNC_ONLINE, RA3_BATTLE_NET, TWITCH, YOUTUBE, MODDB } from '../../utils/emojis';
import { GameId, GAME_CONFIGS } from '../../config/games';

export function buildMainEmbed(game: GameId = 'ra3'): EmbedBuilder {
  const config = GAME_CONFIGS[game];
  return new EmbedBuilder()
    .setTitle('EVA Bot Command Center')
    .setDescription('Select a category from the dropdown below.')
    .setColor(config.color)
    .setThumbnail(config.artworkUrl)
    .addFields(
      {
        name: '🏆 Tournaments',
        value: `Events, sign-ups, results, match reporting and replays${game === 'ra3' ? ', plus the Masters Hall of Fame' : ''}.`,
        inline: false,
      },
      {
        name: '👥 Community',
        value: 'Clans, lobby, maps, online setup guides, tips, live stats and streams.',
        inline: false,
      },
      {
        name: '👤 Profile',
        value: 'View your ranks and manage Shatabrick and RA3BattleNet links.',
        inline: false,
      },
      { name: 'ℹ️ Information', value: 'About this bot, features and news.', inline: false },
      {
        name: '🛠️ Admin Tools *(admin/mod)*',
        value: `Server setup, panels, tournaments${game === 'ra3' ? ', masters' : ''} and bot control.`,
        inline: false,
      },
      { name: '🔨 Moderation *(admin/mod)*', value: 'Kick, ban, purge, warnings.', inline: false },
    )
    .setFooter({ text: 'Use /help anytime to see this menu.' });
}

export function buildTournamentsEmbed(game: GameId = 'ra3'): EmbedBuilder {
  const config = GAME_CONFIGS[game];
  return new EmbedBuilder()
    .setTitle('🏆 Tournaments')
    .setColor(config.color)
    .setThumbnail(config.artworkUrl)
    .addFields(
      {
        name: '📢 Events & Results',
        value: `\`/events\` - Browse tournament announcements (Join/Register while open, **Results** once ended)\n\`/results\` - Final standings & scores from Challonge\n\`/news\` - Latest ${config.shortLabel} news`,
        inline: false,
      },
      ...(game === 'ra3'
        ? [
            {
              name: '🏅 Hall of Fame',
              value: '`/masters` - All-time ladder masters.',
              inline: false,
            },
          ]
        : []),
      {
        name: '⚔️ Matches & Reporting',
        value:
          '`/matches` - Live bracket: results, scores, upcoming matches\n`/report_score <opponent> <factions> <score>` - Submit a result for referee review',
        inline: false,
      },
      {
        name: '🗺️ Map Picker',
        value:
          '`/pickmap [event]` - Show the verified event pool and official map-elimination order',
        inline: false,
      },
      {
        name: '🎮 Replays',
        value:
          game === 'ra3'
            ? '`/replays` - Browse popular and event replays on GameReplays'
            : '`/replays` - Open Generals Evolution replay resources and tournament posts',
        inline: false,
      },
    )
    .setFooter({
      text:
        game === 'ra3'
          ? 'Powered by GameReplays & Challonge'
          : 'Powered by Challonge & the GenEvo community',
    });
}

export function buildCommunityEmbed(game: GameId = 'ra3'): EmbedBuilder {
  const config = GAME_CONFIGS[game];
  return new EmbedBuilder()
    .setTitle('👥 Community')
    .setColor(config.color)
    .setThumbnail(config.artworkUrl)
    .addFields(
      {
        name: '🛡️ Clans',
        value:
          '`/clans` - Browse clans\n`/clan_join <tag>` - Join a clan\n`/clan_leave` - Leave your clan\n`/clan_create` - Start clan creation\n`/clan_manage` - Manage your clan (leader)\n`/clan_remove` - Delete your own clan (leader)',
        inline: false,
      },
      {
        name: '🎮 Lobby Tracker',
        value: `\`/lobby\` - Show active ${config.shortLabel} lobbies (C&C Online and RA3BattleNet)`,
        inline: false,
      },
      {
        name: `${CNC_ONLINE} ${RA3_BATTLE_NET} Online Setup`,
        value: `\`/setup\` - How to install ${config.shortLabel} and its supported online platforms`,
        inline: false,
      },
      {
        name: '🗺️ Maps',
        value: `\`/maps\` - ${game === 'ra3' ? 'RA3 map downloads and the complete map catalog' : 'Generals Evolution 0.33 maps and downloads'}`,
        inline: false,
      },
      {
        name: '💡 Tips & Trivia',
        value: `\`/tips\` - Random ${config.shortLabel} gameplay tip.`,
        inline: false,
      },
      {
        name: '📊 Live Stats',
        value:
          '`/stats` - Community live stats (players, matches, maps and supported 1v1–3v3 modes).',
        inline: false,
      },
      {
        name: `${TWITCH} ${YOUTUBE} Stream Notifications`,
        value:
          '`/notifications` - Choose which streams and events you get notified about.\nAdmins can add tracked streamers and set channels there too.',
        inline: false,
      },
      {
        name: `${MODDB} ModDB Updates`,
        value: `\`/mods\` - Browse the newest ${config.shortLabel} updates from ModDB.\nNew posts are announced automatically when enabled by admins.`,
        inline: false,
      },
    );
}

export function buildProfileEmbed(game: GameId = 'ra3'): EmbedBuilder {
  const config = GAME_CONFIGS[game];
  return new EmbedBuilder()
    .setTitle('👤 Profile & Ranks')
    .setColor(config.color)
    .setThumbnail(config.artworkUrl)
    .addFields(
      {
        name: 'Your Profile',
        value:
          '`/profile [user] [player]` - View Shatabrick and RA3BattleNet ranks\n`/link` - Add, update or remove linked accounts',
        inline: false,
      },
      {
        name: '🔔 Personal Settings',
        value: '`/notifications` - Choose your DM notifications and language.',
        inline: false,
      },
    )
    .setFooter({ text: 'Ranks are awarded by community staff.' });
}

export function buildInfoEmbed(game: GameId = 'ra3'): EmbedBuilder {
  const config = GAME_CONFIGS[game];
  return new EmbedBuilder()
    .setTitle('ℹ️ Information')
    .setColor(config.color)
    .setThumbnail(config.artworkUrl)
    .setDescription(
      `This bot helps the **${config.label}** community ` +
        'organize matches, run tournaments and stay connected ' +
        `across ${game === 'ra3' ? 'GameReplays, C&C Online, Shatabrick and RA3BattleNet' : 'C&C Online, RA3BattleNet, Shatabrick, ModDB, YouTube and Twitch'}.\n\n` +
        '**Features:**\n' +
        '• Multi-platform setup guides & lobby tracker\n' +
        '• Tournaments with Challonge integration & results\n' +
        '• Clan system with custom roles and channels\n' +
        '• Live community stats panel with charts (1v1–3v3)\n' +
        '• Player profiles and ranks (Shatabrick & RA3BattleNet)\n' +
        `• Twitch, YouTube, ModDB and ${config.shortLabel} news\n` +
        '• Custom maps hub & esports map picker\n' +
        '• Moderation tools (kick, ban, warnings)\n\n' +
        '*"From the community, for the community."*',
    )
    .addFields(
      { name: '🛠️ Created by', value: '<@270293736871690240> (Arcy)', inline: true },
      { name: '📅 Version', value: '4.0.0', inline: true },
    );
}

export function buildAdminEmbed(game: GameId = 'ra3'): EmbedBuilder {
  const config = GAME_CONFIGS[game];
  return new EmbedBuilder()
    .setTitle('🛠️ Admin Tools')
    .setColor(config.color)
    .setThumbnail(config.artworkUrl)
    .addFields(
      {
        name: '⚙️ Server Configuration',
        value:
          '`/bot_setup` - Server setup wizard (admin role, channels, features)\n`/set_admin_role <role>` - Set the bot admin role\n`/toggle` - Choose a feature, then enable or disable it\n`/notifications` - Notification channels & streamers (admin view)',
        inline: false,
      },
      {
        name: '🧪 Test Posts (admin)',
        value:
          '`/test_channels` or `/notifications` → Test Posts - verify every configured channel.',
        inline: false,
      },
      {
        name: '📊 Panels',
        value:
          '`/stats_panel set <channel>` - Persistent stats panel\n`/match_panel set <channel>` - Live match ticker\n`/lobby_panel set <channel>` - Persistent lobby board\n(each also has a `disable` subcommand)',
        inline: false,
      },
      ...(game === 'ra3'
        ? [
            {
              name: '🏆 Masters & Tournaments',
              value:
                '`/add_master <name> <year> [patch]` - Add a master\n`/remove_master <name>` - Remove a master\n`/list_masters` - List all masters\n`/tournament_link` - Link a Challonge bracket (paste URL)\n`/tournaments_scan` - Scan the portal + forum for tournaments, brackets and sign-ups\n`/events` - Edit missing tournament details from the private event browser',
              inline: false,
            },
          ]
        : [
            {
              name: '🏆 Tournaments',
              value:
                '`/tournament_link` - Link or create a tournament from a Challonge bracket\n`/checkin [event]` - Open the referee check-in board\n`/events` - Edit missing tournament details from the private event browser',
              inline: false,
            },
          ]),
      {
        name: '👤 Player Profiles',
        value:
          '`/profile_admin view <user>` - Inspect a member profile\n`/profile_admin unlink <user> <platform>` - Remove one link\n`/profile_admin clear <user> <confirm>` - Clear linked identities',
        inline: false,
      },
      {
        name: '✅ Tournament Check-ins',
        value:
          '`/checkin [event]` - Open the current tournament management board (referee)\nIncludes clear numbered lists and personal referee DM alert controls.',
        inline: false,
      },
      {
        name: '🛡️ Clans',
        value:
          '`/clan_manager` - Manage clans (approvals, edit, remove)\n`/clan_approve` - Approve or reject pending clans',
        inline: false,
      },
      {
        name: '🕒 Bot Info',
        value:
          '`/uptime` - Bot uptime\n`/info` - About this bot and version\n`/ping` - Check latency',
        inline: false,
      },
      {
        name: '🔄 Bot Control',
        value: '`/restart` - Restart the bot\n`/kill` - Shut down the bot',
        inline: false,
      },
    );
}

export function buildModerationEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('🔨 Moderation')
    .setColor(0x9400d3)
    .addFields(
      {
        name: 'Member Actions',
        value:
          '`/kick <user> [reason]` - Kick a member\n`/ban <user> [reason] [delete_days]` - Ban a member',
        inline: false,
      },
      {
        name: 'Message Management',
        value: '`/purge <amount> [user]` - Delete messages (max 100)',
        inline: false,
      },
      {
        name: 'Warning System',
        value:
          '`/warn <user> [reason]` - Warn a member\n`/warnings <user>` - View warnings for a member\n`/clear_warnings <user>` - Clear all warnings for a member',
        inline: false,
      },
    )
    .setFooter({ text: 'Visible to admins and moderators.' });
}
