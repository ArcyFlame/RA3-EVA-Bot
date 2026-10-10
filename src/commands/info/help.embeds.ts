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
        value:
          game === 'ra3'
            ? 'View your private profile and switch between C&C Online and RA3BattleNet stats.'
            : 'View your private GenEvo profile, activity rank and RA3BattleNet link.',
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
              value:
                '`/masters` - All-time ladder masters. Controlled by the Masters feature toggle.',
              inline: false,
            },
          ]
        : [
            {
              name: '🏅 Hall of Fame',
              value: '`/masters` - GenEvo masters, if enabled by an admin. Off by default.',
              inline: false,
            },
          ]),
      {
        name: '⚔️ Matches & Reporting',
        value:
          '`/matches` - Live bracket: results, scores, upcoming matches\n`/report score <opponent> <factions> <score>` - Submit a result for referee review',
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
            : "`/replays` - Open this server's selected replay channel",
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
          '`/clans` - Browse clans\n`/clan join <tag>` - Join a clan\n`/clan leave` - Leave your clan\n`/clan create` - Start clan creation\n`/clan manage` - Manage your clan (leader)\n`/clan remove` - Delete your own clan (leader)',
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
        name: '🎖️ Discord Activity Ranks',
        value:
          '`/profile` - Your private profile, activity XP, level and rank\n`/activity leaderboard` - Privately view the top 10 active members' +
          (game === 'genevo'
            ? '\nReplay uploads in the selected channel earn XP. Upvote individual replay cards with 👍; rating bonuses have daily limits.'
            : ''),
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
          '`/profile [user] [player] [platform]` - Private profile with a platform dropdown and server activity rank\n`/link` - Link a nickname, ID or profile URL after confirming the account name',
        inline: false,
      },
      {
        name: '🔔 Personal Settings',
        value: '`/notifications` - Choose your DM notifications and language.',
        inline: false,
      },
    )
    .setFooter({
      text: 'Only you can see these command replies. Activity ranks follow this server’s settings.',
    });
}

export function buildInfoEmbed(game: GameId = 'ra3'): EmbedBuilder {
  const config = GAME_CONFIGS[game];
  return new EmbedBuilder()
    .setTitle('ℹ️ Information')
    .setColor(config.color)
    .setThumbnail(null)
    .setDescription(
      `This bot helps the **${config.label}** community ` +
        'organize matches, run tournaments and stay connected ' +
        `across ${game === 'ra3' ? 'GameReplays, C&C Online, Shatabrick and RA3BattleNet' : 'C&C Online, RA3BattleNet, ModDB, YouTube and Twitch'}.\n\n` +
        '**Features:**\n' +
        '• Multi-platform setup guides & lobby tracker\n' +
        '• Tournaments with Challonge integration & results\n' +
        '• Clan system with custom roles and channels\n' +
        '• Live community stats panel with charts (1v1–3v3)\n' +
        (game === 'ra3'
          ? '• Player profiles and ranks (Shatabrick & RA3BattleNet)\n'
          : '• GenEvo player profiles and server activity ranks\n') +
        `• Twitch, YouTube, ModDB and ${config.shortLabel} news\n` +
        '• Custom maps hub & esports map picker\n' +
        '• Moderation tools (kick, ban, warnings)\n\n' +
        '*"From the community, for the community."*',
    )
    .addFields(
      { name: '🛠️ Created by', value: '<@270293736871690240> (Arcy)', inline: true },
      { name: '📅 Version', value: '5.2.0', inline: true },
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
          '`/bot setup` - Server setup wizard (roles, channels, services, profile and features)\n`/bot profile` - This server’s bot nickname, avatar, banner and description\n`/api` - Service status; shared credentials can be changed only by the bot owner\n`/set admin role <role>` - Set the bot admin role\n`/toggle` - Choose a feature, then enable or disable it\n`/notifications` - Notification channels & streamers (admin view)',
        inline: false,
      },
      {
        name: '🧪 Test Posts (admin)',
        value:
          '`/test channels` or `/notifications` → Test Posts - verify every configured channel.',
        inline: false,
      },
      {
        name: '📊 Panels',
        value:
          '`/panel stats set <channel>` - Persistent stats panel\n`/panel matches set <channel>` - Live match ticker\n`/panel lobby set <channel>` - Persistent lobby board\n(each also has a `disable` subcommand)',
        inline: false,
      },
      ...(game === 'ra3'
        ? [
            {
              name: '🏆 Masters & Tournaments',
              value:
                '`/master add <name> <year> [patch]` - Add a master\n`/master remove <name>` - Remove a master\n`/master list` - List all masters\n`/tournament link` - Link a Challonge bracket (paste URL)\n`/tournament scan` - Scan the portal + forum for tournaments, brackets and sign-ups\n`/events` - Edit missing tournament details from the private event browser',
              inline: false,
            },
          ]
        : [
            {
              name: '🏆 Tournaments',
              value:
                '`/tournament link` - Link or create a tournament from a Challonge bracket\n`/checkin [event]` - Open the referee check-in board\n`/events` - Edit missing tournament details from the private event browser\n`/master add`, `/master remove`, `/master list` - GenEvo masters (enable Masters in `/toggle` first)',
              inline: false,
            },
          ]),
      {
        name: '👤 Player Profiles',
        value:
          '`/admin profile view <user>` - Inspect a member profile\n`/admin profile unlink <user> <platform>` - Remove one link\n`/admin profile clear <user> <confirm>` - Clear linked identities',
        inline: false,
      },
      {
        name: '🎖️ Activity Ranks',
        value:
          '`/activity admin` - Configure ping/replay XP, automatic replay scanning, optional chat XP, levels, ranks and roles. Chat XP is off by default.\n`/notifications` → Replay Uploads - Choose the replay channel.\n`/toggle` → Stats charts or Masters - Enable/disable charts and the Hall of Fame.',
        inline: false,
      },
      ...(game === 'genevo'
        ? [
            {
              name: '🎬 Replay Ratings',
              value:
                '`/activity admin` → Replay Ratings - Enable ratings, set bonus XP limits or scan recent uploads. Each accepted file gets its own downloadable 👍 card. Replay-only original messages are removed after copying. The uploader can edit or remove the card.',
              inline: false,
            },
          ]
        : []),
      {
        name: '✅ Tournament Check-ins',
        value:
          '`/checkin [event]` - Open the current tournament management board (referee)\nIncludes clear numbered lists and personal referee DM alert controls.',
        inline: false,
      },
      {
        name: '🛡️ Clans',
        value:
          '`/clan manager` - Manage clans (approvals, edit, remove)\n`/clan approve` - Approve or reject pending clans',
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
          '`/kick <user> [reason]` - Kick a member\n`/ban <user> [reason] [delete-days]` - Ban a member',
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
          '`/warn <user> [reason]` - Warn a member\n`/warnings <user>` - View warnings for a member\n`/clear warnings <user>` - Clear all warnings for a member',
        inline: false,
      },
      {
        name: '🎖️ Activity XP & Roles',
        value:
          '`/activity xp <member> <amount>` - Add XP or use a negative amount to remove XP\n`/activity role <member> <action> [role]` - Add a configured rank role, remove rank roles or restore automatic XP ranking\nOnly configured cosmetic activity roles can be changed. Replies are private.',
        inline: false,
      },
    )
    .setFooter({ text: 'Visible to admins and moderators.' });
}
