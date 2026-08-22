import { EmbedBuilder } from 'discord.js';
import {
  CNC_ONLINE,
  RA3_BATTLE_NET,
  TWITCH,
  YOUTUBE,
  MODDB,
} from '../../utils/emojis';

export function buildMainEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('EVA Bot Command Center')
    .setDescription('Select a category from the dropdown below.')
    .setColor(0x5865f2)
    .addFields(
      {
        name: '🏆 Tournaments',
        value: 'Events, sign-ups, results, masters, match reporting, replays.',
        inline: false,
      },
      {
        name: '👥 Community',
        value: 'Clans, lobby, maps, online setup guides, build orders, tips, live stats, streams.',
        inline: false,
      },
      {
        name: '👤 Profile',
        value: 'View your rank and link your Shatabrick account.',
        inline: false,
      },
      { name: 'ℹ️ Information', value: 'About this bot, features and news.', inline: false },
      {
        name: '🛠️ Admin Tools *(admin/mod)*',
        value: 'Server setup, panels, masters, tournaments, bot control.',
        inline: false,
      },
      { name: '🔨 Moderation *(admin/mod)*', value: 'Kick, ban, purge, warnings.', inline: false },
    )
    .setFooter({ text: 'Use /help anytime to see this menu.' });
}

export function buildTournamentsEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('🏆 Tournaments')
    .setColor(0x00ff00)
    .addFields(
      {
        name: '📢 Events & Results',
        value:
          '`/events` - Browse tournament announcements (Sign Up while open, **Results** once ended)\n`/results` - Final standings & scores from Challonge\n`/news` - Latest RA3 news from GameReplays',
        inline: false,
      },
      {
        name: '🏅 Hall of Fame',
        value: '`/masters` - All-time ladder masters.',
        inline: false,
      },
      {
        name: '⚔️ Matches & Reporting',
        value:
          '`/matches` - Live bracket: results, scores, upcoming matches\n`/report_score [opponent]` - Report a match result',
        inline: false,
      },
      {
        name: '✅ Check-ins',
        value: '`/checkin start <event>` - Open the check-in board (referee)\n`/checkin status <event>` - Registered and checked-in players',
        inline: false,
      },
      {
        name: '🗺️ Map Picker',
        value:
          '`/pickmap random [event]` - Random map (from an event\u2019s pool if given)\n`/pickmap list [event]` - Show a map pool with 1.12.8 links',
        inline: false,
      },
      {
        name: '🎮 Replays',
        value: '`/replays` - Browse popular & event replays on GameReplays',
        inline: false,
      },
    )
    .setFooter({ text: 'Powered by GameReplays & Challonge' });
}

export function buildCommunityEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('👥 Community')
    .setColor(0x800080)
    .addFields(
      {
        name: '🛡️ Clans',
        value:
          '`/clans` - Browse clans\n`/clan_join <tag>` - Join a clan\n`/clan_leave` - Leave your clan\n`/clan_create` - Start clan creation\n`/clan_manage` - Manage your clan (leader)\n`/clan_remove` - Delete your own clan (leader)',
        inline: false,
      },
      {
        name: '🎮 Lobby Tracker',
        value: '`/lobby` - Show active RA3 lobbies (C&C Online & RA3BattleNet)',
        inline: false,
      },
      {
        name: `${CNC_ONLINE} ${RA3_BATTLE_NET} Online Setup`,
        value: '`/setup` - How to install C&C Online or RA3BattleNet and play online',
        inline: false,
      },
      {
        name: '🗺️ Maps',
        value: '`/maps` - Download custom maps (Steam Workshop, CNCLabs, RA3BattleNet, ModDB)',
        inline: false,
      },
      {
        name: '📦 Build Orders',
        value:
          '`/build_create` - Create a build order (interactive, unit emojis supported)\n`/build_list` - Your builds & latest community builds\n`/build_view <name> [author]` - View a build\n`/build_remove <name>` - Delete your build',
        inline: false,
      },
      {
        name: '💡 Tips & Trivia',
        value: '`/tips` - Random verified RA3 gameplay tip or fun fact.',
        inline: false,
      },
      {
        name: '📊 Live Stats',
        value: '`/stats` - Community live stats (players, matches, factions, maps, leaderboards 1v1–4v4).',
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
        value:
          '`/mods` - Browse the newest RA3 mods, articles and news from ModDB.\nNew items are posted automatically when enabled by admins.',
        inline: false,
      },
    );
}

export function buildProfileEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('👤 Profile & Ranks')
    .setColor(0x008080)
    .addFields(
      {
        name: 'Your Profile',
        value:
          '`/profile [user]` - View RA3 ranks (Shatabrick & RA3BattleNet)\n`/link_shatabrick <username>` - Connect your Shatabrick (C&C Online) account\n`/link_ra3battlenet <username>` - Connect your RA3BattleNet persona',
        inline: false,
      },
      {
        name: '🔔 Personal Settings',
        value:
          '`/notifications` - Personal settings: DM notifications and your language (English / Русский / 中文).',
        inline: false,
      },
    )
    .setFooter({ text: 'Ranks are awarded by community staff.' });
}

export function buildInfoEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('ℹ️ Information')
    .setColor(0xffd700)
    .setDescription(
      'This bot helps the **Command & Conquer: Red Alert 3** community ' +
        'organize matches, run tournaments and stay connected ' +
        'across different multiplayer platforms.\n\n' +
        '**Features:**\n' +
        '• Multi-platform setup guides & lobby tracker\n' +
        '• Tournaments with Challonge integration & results\n' +
        '• Clan system with custom roles and channels\n' +
        '• Live community stats panel with charts (1v1–4v4)\n' +
        '• Player profiles and ranks (Shatabrick & RA3BattleNet)\n' +
        '• Twitch/YouTube/ModDB notifications & RA3 news\n' +
        '• Custom maps hub & esports map picker\n' +
        '• Build orders with unit emojis\n' +
        '• Moderation tools (kick, ban, warnings)\n\n' +
        '*"From the community, for the community."*',
    )
    .addFields(
      { name: '🛠️ Created by', value: '<@270293736871690240> (Arcy)', inline: true },
      { name: '📅 Version', value: '4.0.0', inline: true },
    );
}

export function buildAdminEmbed(): EmbedBuilder {
  return new EmbedBuilder().setTitle('🛠️ Admin Tools').setColor(0x8b0000).addFields(
    {
      name: '⚙️ Server Configuration',
      value:
        '`/bot_setup` - Server setup wizard (admin role, channels, features)\n`/set_admin_role <role>` - Set the bot admin role\n`/toggle` - Feature toggles + Menu/Command mode switch\n`/notifications` - Notification channels & streamers (admin view)',
      inline: false,
    },
    {
      name: '🧪 Test Posts (admin)',
      value: '`/notifications` → Test Posts - verify each notification channel works.',
      inline: false,
    },
    {
      name: '📊 Panels',
      value:
        '`/stats_panel set <channel>` - Persistent stats panel\n`/match_panel set <channel>` - Live match ticker\n`/lobby_panel set <channel>` - Persistent lobby board\n(each also has a `disable` subcommand)',
      inline: false,
    },
      {
        name: '🏆 Masters & Tournaments',
        value:
          '`/add_master <name> <year> [patch]` - Add a master\n`/remove_master <name>` - Remove a master\n`/list_masters` - List all masters\n`/tournament_link` - Link a Challonge bracket (paste URL)\n`/tournaments_scan` - Scan the portal + forum for tournaments, brackets and sign-ups',
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
      value: '`/uptime` - Bot uptime\n`/info` - About this bot and version\n`/ping` - Check latency',
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
