import { EmbedBuilder } from 'discord.js';
import { CNC_ONLINE, RA3_BATTLE_NET, TWITCH, YOUTUBE, MODDB } from '../../utils/emojis';
import { GameId, GAME_CONFIGS } from '../../config/games';

export function buildMainEmbed(game: GameId = 'ra3', staff = false): EmbedBuilder {
  const config = GAME_CONFIGS[game];
  return new EmbedBuilder()
    .setTitle('EVA Bot Command Center')
    .setDescription('Select a category from the dropdown below.')
    .setColor(config.color)
    .setThumbnail(config.artworkUrl)
    .addFields(
      {
        name: '🏆 Tournaments',
        value: `Events, sign-ups, results, match reporting and replays${game === 'ra3' ? ', plus the Experts Hall of Fame' : ''}.`,
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
      ...(staff
        ? [
            {
              name: '🛠️ Admin Tools *(admin/mod)*',
              value:
                'Server setup, tip management and visibility, panels, tournaments and activity settings.',
              inline: false,
            },
            {
              name: '🔨 Moderation *(admin/mod)*',
              value: 'Kick, ban, purge, warnings and activity XP.',
              inline: false,
            },
          ]
        : []),
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
                '`/experts` - All-time community experts. Controlled by the Experts feature toggle.',
              inline: false,
            },
          ]
        : [
            {
              name: '🏅 Hall of Fame',
              value: '`/experts` - GenEvo experts, if enabled by an admin.',
              inline: false,
            },
          ]),
      {
        name: '⚔️ Matches & Reporting',
        value:
          '`/matches` - Live bracket: results, scores, upcoming matches\n`/report score` - Choose tournament, opponent and factions, enter score, then Submit for Review',
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
            : '`/replays` - Top 10 replays, your uploads and private replay controls',
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
        name: '💡 Gameplay Tips',
        value: `\`/tips\` - ${config.shortLabel} tips with source links. Public by default; server staff can make replies private.`,
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
            ? '\nReplay uploads earn XP. /replays shows the top 10; My Replays opens private Edit and Remove buttons. Use 👍 below a replay to vote. Repeated votes earn no extra XP.'
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

export function buildInfoEmbed(game: GameId = 'ra3', staff = false): EmbedBuilder {
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
        (staff ? '• Moderation tools (kick, ban, warnings)\n\n' : '\n') +
        '*"From the community, for the community."*',
    )
    .addFields(
      { name: '🛠️ Created by', value: '<@270293736871690240> (Arcy)', inline: true },
      { name: '📅 Version', value: '5.4.0', inline: true },
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
          '`/bot setup` - Configure this server\n`/bot profile` - Edit this server bot profile\n`/api` - Service status (keys: bot owner only)\n`/set admin role <role>` - Choose the admin role\n`/toggle` - Enable or disable features\n`/notifications` - Posting channels and streamers',
        inline: false,
      },
      {
        name: '💡 Gameplay Tips (admin/mod)',
        value:
          '`/bot tips` - Manage server tips\n**Add Tip / Edit Tip** - Step 1: title, faction/subfaction, text and footer. Step 2: separate quote, speaker and source fields. Submit Step 2 to save.\n**Make Tips Public / Private** - Set visibility for all `/tips` replies (public by default)\n**Enable Tips / Disable Tips** - Switch tips on or off\n**Find Tip** - Search by number or title when there are more than 25 tips. Private replies are not DMs.',
        inline: false,
      },
      {
        name: '⏱️ Refresh Timing (admin)',
        value:
          '`/bot refresh` - Set lobby, stats and match panel intervals for this server. Shared scanner intervals are bot-owner only.',
        inline: false,
      },
      {
        name: '🏅 Experts (admin/mod)',
        value:
          '`/experts` - Add Expert, Edit Expert or Remove Expert. Set name, year and optional patch. Changes affect this server only.',
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
          '`/panel stats set` - Stats panel menu\n`/panel matches set` - Match ticker menu\n`/panel lobby set` - Lobby board menu\nChoose a channel, then Create Panel. Each also has a `disable` subcommand.',
        inline: false,
      },
      ...(game === 'ra3'
        ? [
            {
              name: '🏆 Experts & Tournaments',
              value:
                '`/tournament link` - Link a Challonge bracket (paste URL)\n`/tournament scan` - Scan the portal + forum for tournaments, brackets and sign-ups\n`/events` - Edit missing tournament details from the private event browser',
              inline: false,
            },
          ]
        : [
            {
              name: '🏆 Tournaments',
              value:
                '`/tournament link` - Link or create a tournament from a Challonge bracket\n`/checkin` - Choose an event and open its check-in board\n`/events` - Edit missing tournament details from the private event browser',
              inline: false,
            },
          ]),
      {
        name: '👤 Player Profiles',
        value:
          '`/admin profile view` or `/admin profile unlink` - Choose a member, view their profile or confirm an unlink. Shared identity removal is limited to the profile owner or bot owner.',
        inline: false,
      },
      {
        name: '🎖️ Activity Ranks',
        value:
          '`/activity admin` - Configure XP, ranks and replay ratings\n`/activity xp` - Add or remove member XP\n`/activity role` - Manage configured activity rank roles',
        inline: false,
      },
      ...(game === 'genevo'
        ? [
            {
              name: '🎬 Replay Ratings',
              value:
                '`/activity admin` → Replay Ratings - Voting, XP limits, scanning and Medal Settings\n`/replays` → My Replays - Private Edit and Remove buttons. Admins can also manage server replays.',
              inline: false,
            },
          ]
        : []),
      {
        name: '✅ Tournament Check-ins',
        value:
          '`/checkin` - Choose an event and open the readiness board\n`/tournament participant` - Choose event, Discord member and registered player, then Confirm Association (organizer staff)\n`/tournament organizer` - Choose event and server, then assign or remove organizer authority (bot owner)',
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
        name: '🔄 Bot Control (bot owner)',
        value:
          '`/bot update` - Check for a stable release and confirm Yes or No\n`/restart` - Restart the bot\n`/kill` - Shut down the bot',
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
