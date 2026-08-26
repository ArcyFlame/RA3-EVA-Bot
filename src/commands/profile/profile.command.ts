import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  User as DiscordUser,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { userRepository } from '../../repositories/user.repository';
import { guildRepository } from '../../repositories/guild.repository';
import { ra3StatsService } from '../../services/ra3-stats.service';
import {
  Ra3bPersonaLadder,
  Ra3bPersonaStats,
  Ra3bSeasonHistory,
} from '../../services/ra3-stats.service';
import { FACTION_ALLIED, FACTION_SOVIET, FACTION_EMPIRE, FACTION_RANDOM } from '../../utils/emojis';
import { t } from '../../utils/i18n';
import { Language } from '../../repositories/user.repository';
import {
  shatabrickService,
  ShatabrickModeStats,
  ShatabrickProfile,
  SHATABRICK_MODE_LABELS,
} from '../../services/shatabrick.service';
import { GameId, GAME_CONFIGS } from '../../config/games';

export const data = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('Show linked C&C Online and game-platform ranks')
  .addUserOption((option) =>
    option.setName('user').setDescription('Discord user to view').setRequired(false),
  )
  .addStringOption((option) =>
    option
      .setName('player')
      .setDescription('Any player by Shatabrick or platform nickname/profile ID')
      .setRequired(false),
  );

export const guildOnly = false;

function addRa3bFields(
  embed: EmbedBuilder,
  stats: Ra3bPersonaStats | null,
  history: Ra3bSeasonHistory[],
  fallbackName: string,
  lang: Language,
  showSeasonHistory = true,
): void {
  embed.addFields({
    name: `⚔️ ${t(lang, 'profile.ra3b')}${showSeasonHistory ? ' • Current Season' : ''}`,
    value: `**${stats?.personaName ?? fallbackName}**`,
    inline: false,
  });
  const ladders: Array<[string, Ra3bPersonaLadder | null]> = [
    ['1v1', stats?.ladder1v1 ?? null],
    ['2v2', stats?.ladder2v2 ?? null],
    ['3v3', stats?.ladder3v3 ?? null],
  ];
  for (const [mode, ladder] of ladders) {
    embed.addFields({
      name: mode,
      value: ladder ? formatLadder(ladder, lang) : t(lang, 'profile.notRanked'),
      inline: true,
    });
  }
  const seasons = history
    .slice(0, 8)
    .map(
      (h) =>
        `${h.seasonNameEnglish ?? h.seasonNameChinese ?? `S${h.seasonId}`} ${h.ladderType}: ${h.endElo} (#${h.endRank})`,
    );
  if (showSeasonHistory && seasons.length > 0) {
    embed.addFields({
      name: `📚 ${t(lang, 'profile.seasons')}`,
      value: seasons.join('\n').slice(0, 1024),
      inline: false,
    });
  }
}

function formatShatabrickMode(stats: ShatabrickModeStats): string {
  const total = stats.games || stats.wins + stats.losses;
  const winRate = total > 0 ? Math.round((stats.wins / total) * 100) : 0;
  const rating = [
    stats.elo ? `ELO **${stats.elo}**` : '',
    stats.rank ? `Rank **#${stats.rank}**` : '',
  ]
    .filter(Boolean)
    .join(' • ');
  return `${rating ? `${rating}\n` : ''}**${stats.wins}W / ${stats.losses}L**${total ? ` • ${winRate}%` : ''}\n${total} games`;
}

function addShatabrickFields(embed: EmbedBuilder, profile: ShatabrickProfile): void {
  const summary = [
    `[**${profile.nickname}**](${profile.profileUrl})`,
    profile.rankLabel ? `Rank: **${profile.rankLabel}**` : '',
    profile.level != null ? `Level: **${profile.level}**` : '',
    profile.score != null ? `Score: **${profile.score}**` : '',
  ]
    .filter(Boolean)
    .join(' • ');
  embed.addFields({ name: '🌐 Shatabrick • C&C Online', value: summary, inline: false });
  for (const mode of SHATABRICK_MODE_LABELS) {
    embed.addFields({ name: mode, value: formatShatabrickMode(profile.modes[mode]), inline: true });
  }
  if (profile.rankImageUrl) embed.setThumbnail(profile.rankImageUrl);
}

function factionEmoji(faction: string | undefined): string {
  const f = (faction || '').toLowerCase();
  if (f.includes('allied')) return FACTION_ALLIED;
  if (f.includes('soviet')) return FACTION_SOVIET;
  if (f.includes('empire')) return FACTION_EMPIRE;
  return FACTION_RANDOM;
}

/** "1234 elo · #12 · 15W/4L (79%) · 🇺🇸" (placement-aware). */
function formatLadder(ladder: Ra3bPersonaLadder, lang: Language): string {
  const total = ladder.wins + ladder.losses;
  const rate = total > 0 ? ` (${Math.round((ladder.wins / total) * 100)}%)` : '';
  const record = `${ladder.wins}W/${ladder.losses}L${rate}`;
  const faction = factionEmoji(ladder.primaryFaction);
  if (ladder.rank > 0 && ladder.elo > 0) {
    return `\`${ladder.elo}\` elo · #${ladder.rank} · ${record} · ${faction}`;
  }
  if (total > 0) {
    return `${t(lang, 'profile.placement')} (${ladder.placementMatchesLeft} ${t(lang, 'profile.left')}) · ${record} · ${faction}`;
  }
  return `${t(lang, 'profile.noGames')} · ${faction}`;
}

function tournamentWinCount(
  wins: Record<string, number>,
  names: Array<string | undefined>,
): number {
  const wanted = new Set(names.filter(Boolean).map((name) => name!.toLocaleLowerCase('en-US')));
  return Object.entries(wins).reduce(
    (total, [name, count]) =>
      wanted.has(name.toLocaleLowerCase('en-US')) ? total + Number(count || 0) : total,
    0,
  );
}

/** Shared profile card used by /profile and the admin profile manager. */
export async function buildDiscordProfileEmbed(
  target: DiscordUser,
  lang: Language,
  game: GameId = 'ra3',
): Promise<EmbedBuilder> {
  const user = userRepository.findByDiscordId(target.id);
  const config = GAME_CONFIGS[game];
  const embed = new EmbedBuilder()
    .setTitle(`🎖️ ${target.displayName}${t(lang, 'profile.title')}`)
    .setColor(config.color)
    .setAuthor({ name: target.username, iconURL: target.displayAvatarURL() })
    .setThumbnail(config.artworkUrl)
    .setDescription(`**Discord:** <@${target.id}>\n${t(lang, 'profile.discordDescription')}`);

  if (user?.shatabrickUsername) {
    const profile = await shatabrickService.resolve(user.shatabrickUsername).catch(() => null);
    if (profile) addShatabrickFields(embed, profile);
    else {
      embed.addFields({
        name: `🌐 ${t(lang, 'profile.shatabrick')}`,
        value: `**${user.shatabrickUsername}**\n${t(lang, 'profile.notFound')}`,
        inline: false,
      });
    }
  } else {
    embed.addFields({
      name: `🌐 ${t(lang, 'profile.shatabrick')}`,
      value: `⚪ ${t(lang, 'profile.noLink')}`,
      inline: false,
    });
  }

  const ra3bLinked = user?.ra3bUsername;
  if (ra3bLinked) {
    const personaId =
      user?.ra3bPersonaId ??
      (await ra3StatsService.findRa3bPersonaId(ra3bLinked).catch(() => null));
    if (personaId) {
      const [stats, history] = await Promise.all([
        ra3StatsService.getRa3bPersonaStats(personaId).catch(() => null),
        game === 'ra3'
          ? ra3StatsService.getRa3bPersonaHistory(personaId).catch(() => [])
          : Promise.resolve([]),
      ]);
      addRa3bFields(embed, stats, history, ra3bLinked, lang, game === 'ra3');
    } else {
      const ra3b = await ra3StatsService.findRA3BattleNetPlayer(ra3bLinked).catch(() => null);
      embed.addFields({
        name: `⚔️ ${t(lang, 'profile.ra3b')}`,
        value: ra3b
          ? `**${ra3b.personaName}**\n${t(lang, 'profile.elo')}: \`${ra3b.elo}\` · ${ra3b.mode}`
          : `**${ra3bLinked}**\n${t(lang, 'profile.notFound')}`,
        inline: false,
      });
    }
  } else {
    embed.addFields({
      name: `⚔️ ${t(lang, 'profile.ra3b')}`,
      value: `⚪ ${t(lang, 'profile.ra3bNoLink')}`,
      inline: false,
    });
  }

  const wins = (await ra3StatsService.fetch(game).catch(() => null))?.tournament_wins ?? {};
  const winCount = tournamentWinCount(wins, [
    user?.shatabrickUsername,
    user?.ra3bUsername,
    target.displayName,
    target.username,
  ]);
  embed.addFields({
    name: `🏆 ${t(lang, 'profile.tournamentWins')}`,
    value: winCount > 0 ? `**${winCount}**` : '—',
    inline: true,
  });
  embed.setFooter({ text: `${config.shortLabel} • ${t(lang, 'profile.footer')}` });
  return embed;
}

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  const guildData = interaction.guildId
    ? await guildRepository.findByDiscordId(interaction.guildId)
    : undefined;
  if (interaction.guildId && guildData?.profilesEnabled === 0) {
    await interaction.reply({
      content: '❌ Profiles are disabled on this server.',
      ephemeral: true,
    });
    return;
  }

  const lang = userRepository.getLanguage(interaction.user.id);
  const game = guildData?.game ?? 'ra3';
  const config = GAME_CONFIGS[game];

  // ── By player name: works for community members who don't use Discord. ──
  const playerQuery = interaction.options.getString('player')?.trim();
  if (playerQuery) {
    await interaction.deferReply({ ephemeral: true });
    const shatabrick = await shatabrickService.resolve(playerQuery).catch(() => null);
    const personaId = /^\d{1,10}$/.test(playerQuery)
      ? parseInt(playerQuery, 10)
      : await ra3StatsService.findRa3bPersonaId(playerQuery).catch(() => null);
    const [stats, history] = personaId
      ? await Promise.all([
          ra3StatsService.getRa3bPersonaStats(personaId).catch(() => null),
          game === 'ra3'
            ? ra3StatsService.getRa3bPersonaHistory(personaId).catch(() => [])
            : Promise.resolve([]),
        ])
      : [null, [] as Ra3bSeasonHistory[]];
    if (!shatabrick && !stats) {
      await interaction.editReply(
        `No ${config.shortLabel} profile was found for \`${playerQuery}\`. Try the nickname or numeric profile ID shown on Shatabrick or RA3BattleNet.`,
      );
      return;
    }
    const embed = new EmbedBuilder()
      .setTitle(
        `🎖️ ${shatabrick?.nickname ?? stats?.personaName ?? playerQuery} — ${t(lang, 'profile.playerProfile')}`,
      )
      .setColor(config.color)
      .setThumbnail(config.artworkUrl)
      .setDescription(`${t(lang, 'profile.communityPlayer')}\n${t(lang, 'profile.liveRecord')}`);
    if (shatabrick) addShatabrickFields(embed, shatabrick);
    if (stats) addRa3bFields(embed, stats, history, playerQuery, lang, game === 'ra3');
    // Tournament Wins leaderboard, when this name has recorded titles.
    const wins = (await ra3StatsService.fetch(game).catch(() => null))?.tournament_wins ?? {};
    const winCount = tournamentWinCount(wins, [stats?.personaName, shatabrick?.nickname]);
    if (winCount) {
      embed.addFields({
        name: `🏆 ${t(lang, 'profile.tournamentWins')}`,
        value: `**${winCount}**`,
        inline: true,
      });
    }
    embed.setFooter({
      text: `${config.shortLabel} • ${t(lang, 'profile.liveRecord')}`,
    });
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const target = interaction.options.getUser('user') || interaction.user;
  const embed = await buildDiscordProfileEmbed(target, lang, game);
  await interaction.reply({ embeds: [embed], ephemeral: true });
}
