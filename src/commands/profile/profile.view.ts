import { EmbedBuilder, User as DiscordUser, escapeMarkdown } from 'discord.js';
import { GameId, GAME_CONFIGS } from '../../config/games';
import { userRepository, Language } from '../../repositories/user.repository';
import {
  ra3StatsService,
  Ra3bPersonaStats,
  Ra3bPersonaLadder,
} from '../../services/ra3-stats.service';
import {
  shatabrickService,
  ShatabrickProfile,
  SHATABRICK_MODE_LABELS,
} from '../../services/shatabrick.service';
import { CNC_ONLINE, RA3_BATTLE_NET, GOLD_CUP } from '../../utils/emojis';
import { t } from '../../utils/i18n';
import { activitySummary } from './activity-summary';

export type ProfilePlatform = 'cnc' | 'ra3b';

function addShatabrick(embed: EmbedBuilder, profile: ShatabrickProfile): void {
  embed.addFields({
    name: `${CNC_ONLINE} C&C Online - Shatabrick`,
    value: [
      `[**${escapeMarkdown(profile.nickname)}**](${profile.profileUrl})`,
      profile.level != null ? `Level **${profile.level}**` : '',
      profile.score != null ? `Score **${profile.score}**` : '',
    ]
      .filter(Boolean)
      .join(' · '),
  });
  if (profile.rankImageUrl) embed.setThumbnail(profile.rankImageUrl);
  if (profile.clanName || profile.clanTag)
    embed.addFields({
      name: '👥 Clan',
      value: [
        profile.clanName ? `**${escapeMarkdown(profile.clanName)}**` : '',
        profile.clanTag ? `Tag: **${escapeMarkdown(profile.clanTag)}**` : '',
      ]
        .filter(Boolean)
        .join(' · '),
    });
  for (const mode of SHATABRICK_MODE_LABELS) {
    const stats = profile.modes[mode];
    if (!stats.games && !stats.wins && !stats.losses && !stats.elo && !stats.rank) continue;
    const total = stats.wins + stats.losses;
    embed.addFields({
      name: mode,
      value:
        [
          stats.elo ? `ELO **${stats.elo}**` : '',
          stats.rank ? `Rank **#${stats.rank}**` : '',
          `**${stats.wins}W / ${stats.losses}L**`,
          total ? `${Math.round((stats.wins / total) * 100)}% win rate` : '',
        ]
          .filter(Boolean)
          .join(' · ') +
        `\n${stats.games || total} games recorded` +
        (stats.seasonWins != null || stats.seasonLosses != null
          ? `\nCurrent season: **${stats.seasonWins ?? 0}W / ${stats.seasonLosses ?? 0}L**`
          : ''),
    });
  }
}

function ladderText(ladder: Ra3bPersonaLadder | null): string {
  if (!ladder) return 'No games recorded';
  const total = ladder.wins + ladder.losses;
  const rating =
    ladder.rank > 0 && ladder.elo > 0 ? `ELO **${ladder.elo}** · Rank **#${ladder.rank}**\n` : '';
  return (
    rating +
    `**${ladder.wins}W / ${ladder.losses}L**` +
    (total ? ` · ${Math.round((ladder.wins / total) * 100)}% win rate` : ' · No games recorded')
  );
}

function addBattleNet(
  embed: EmbedBuilder,
  stats: Ra3bPersonaStats | null,
  nickname: string,
  personaId?: number,
): void {
  const name = escapeMarkdown(stats?.personaName ?? nickname);
  embed.addFields({
    name: `${RA3_BATTLE_NET} RA3BattleNet`,
    value: personaId ? `[**${name}**](https://ra3battle.net/persona/${personaId})` : `**${name}**`,
  });
  if (stats)
    for (const [mode, ladder] of [
      ['1v1', stats.ladder1v1],
      ['2v2', stats.ladder2v2],
      ['3v3', stats.ladder3v3],
    ] as const)
      embed.addFields({ name: mode, value: ladderText(ladder) });
  else
    embed.addFields({
      name: 'Statistics',
      value: 'No platform statistics are available for this game right now.',
    });
}

async function addWins(
  embed: EmbedBuilder,
  game: GameId,
  names: Array<string | undefined>,
): Promise<void> {
  const wanted = new Set(
    names.filter(Boolean).map((name) => name!.trim().toLocaleLowerCase('en-US')),
  );
  const wins = (await ra3StatsService.fetch(game).catch(() => null))?.tournament_wins ?? {};
  const count = Object.entries(wins).reduce(
    (total, [name, n]) =>
      total + (wanted.has(name.trim().toLocaleLowerCase('en-US')) ? Number(n || 0) : 0),
    0,
  );
  embed.addFields({ name: `${GOLD_CUP} Tournament Wins`, value: `**${count}** confirmed wins` });
}

export async function buildDiscordProfileEmbed(
  target: DiscordUser,
  lang: Language,
  game: GameId = 'ra3',
  guildId?: string | null,
  platform: ProfilePlatform = 'cnc',
): Promise<EmbedBuilder> {
  const user = userRepository.findByDiscordId(target.id);
  const embed = new EmbedBuilder()
    .setTitle(`👤 ${target.displayName}${t(lang, 'profile.title')}`)
    .setColor(GAME_CONFIGS[game].color)
    .setAuthor({ name: target.username, iconURL: target.displayAvatarURL() })
    .setThumbnail(target.displayAvatarURL());
  const activity = guildId ? activitySummary(guildId, target.id) : undefined;
  if (activity) embed.addFields(activity);
  await addWins(embed, game, [
    user?.shatabrickUsername,
    user?.ra3bUsername,
    target.username,
    target.displayName,
  ]);
  if (platform === 'cnc' && game === 'ra3') {
    const profile = user?.shatabrickUsername
      ? await shatabrickService.resolve(user.shatabrickUsername).catch(() => null)
      : null;
    if (profile) addShatabrick(embed, profile);
    else
      embed.addFields({
        name: `${CNC_ONLINE} C&C Online - Shatabrick`,
        value: user?.shatabrickUsername
          ? 'The linked profile could not be loaded right now.'
          : 'Use /link to connect your Shatabrick profile.',
      });
  } else {
    const id =
      user?.ra3bPersonaId ??
      (user?.ra3bUsername
        ? await ra3StatsService.findRa3bPersonaId(user.ra3bUsername).catch(() => null)
        : null);
    const identity = id ? await ra3StatsService.getRa3bPersonaStats(id).catch(() => null) : null;
    if (
      identity &&
      user?.ra3bUsername &&
      identity.personaName.toLocaleLowerCase('en-US') !==
        user.ra3bUsername.toLocaleLowerCase('en-US')
    ) {
      embed.addFields({
        name: `${RA3_BATTLE_NET} RA3BattleNet`,
        value:
          'The saved nickname and profile ID do not match. Use /link to confirm your correct account.',
      });
    } else if (user?.ra3bUsername) {
      const stats =
        game === 'ra3'
          ? identity
          : id
            ? await ra3StatsService.getRa3bPersonaStats(id, game).catch(() => null)
            : null;
      addBattleNet(embed, stats, user.ra3bUsername, id ?? undefined);
    } else
      embed.addFields({
        name: `${RA3_BATTLE_NET} RA3BattleNet`,
        value: 'Use /link to connect your RA3BattleNet profile.',
      });
  }
  return embed.setFooter({
    text: GAME_CONFIGS[game].shortLabel + ' - /link manages your linked accounts',
  });
}

export async function buildPlayerProfileEmbed(
  query: string,
  platform: ProfilePlatform,
  lang: Language,
  game: GameId,
): Promise<EmbedBuilder> {
  const embed = new EmbedBuilder()
    .setTitle(`${escapeMarkdown(query)} - ${t(lang, 'profile.playerProfile')}`)
    .setColor(GAME_CONFIGS[game].color);
  if (platform === 'cnc' && game === 'ra3') {
    const profile = await shatabrickService.resolve(query).catch(() => null);
    if (profile) {
      await addWins(embed, game, [profile.nickname]);
      addShatabrick(embed, profile);
    } else embed.setDescription('No Shatabrick profile was found for that nickname or ID.');
  } else {
    const id = /^\d{1,10}$/.test(query)
      ? Number(query)
      : await ra3StatsService.findRa3bPersonaId(query).catch(() => null);
    const identity = id ? await ra3StatsService.getRa3bPersonaStats(id).catch(() => null) : null;
    if (identity) {
      await addWins(embed, game, [identity.personaName]);
      const stats =
        game === 'ra3'
          ? identity
          : await ra3StatsService.getRa3bPersonaStats(id!, game).catch(() => null);
      addBattleNet(embed, stats, identity.personaName, id!);
    } else embed.setDescription('No RA3BattleNet profile was found for that nickname or ID.');
  }
  return embed;
}
