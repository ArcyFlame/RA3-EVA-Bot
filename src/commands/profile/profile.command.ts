import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
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

export const data = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('Show an RA3 profile (Shatabrick & RA3BattleNet ranks)')
  .addUserOption((option) =>
    option.setName('user').setDescription('Discord user to view').setRequired(false),
  )
  .addStringOption((option) =>
    option
      .setName('player')
      .setDescription('Any player by RA3BattleNet name or persona id (no Discord needed)')
      .setRequired(false),
  );

export const guildOnly = false;

/** Shared RA3BattleNet section lines (persona stats + season history). */
async function buildRa3bLines(
  stats: Ra3bPersonaStats | null,
  history: Ra3bSeasonHistory[],
  fallbackName: string,
  lang: Language,
): Promise<string[]> {
  const lines: string[] = [`**${stats?.personaName ?? fallbackName}**`];
  const ladders: Array<[string, Ra3bPersonaLadder | null]> = [
    ['1v1', stats?.ladder1v1 ?? null],
    ['2v2', stats?.ladder2v2 ?? null],
    ['3v3', stats?.ladder3v3 ?? null],
  ];
  for (const [mode, ladder] of ladders) {
    if (ladder) lines.push(`${mode}: ${formatLadder(ladder, lang)}`);
  }
  if (lines.length === 1) lines.push(t(lang, 'profile.notRanked'));
  const seasons = history
    .slice(0, 4)
    .map(
      (h) =>
        `${h.seasonNameEnglish ?? h.seasonNameChinese ?? `S${h.seasonId}`} ${h.ladderType}: ${h.endElo} (#${h.endRank})`,
    );
  if (seasons.length > 0) lines.push(`${t(lang, 'profile.seasons')}: ${seasons.join(' · ')}`);
  return lines;
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

  // ── By player name: works for community members who don't use Discord. ──
  const playerQuery = interaction.options.getString('player')?.trim();
  if (playerQuery) {
    await interaction.deferReply({ ephemeral: true });
    const personaId = /^\d{1,10}$/.test(playerQuery)
      ? parseInt(playerQuery, 10)
      : await ra3StatsService.findRa3bPersonaId(playerQuery).catch(() => null);
    if (!personaId) {
      await interaction.editReply(
        `No RA3BattleNet persona \`${playerQuery}\` found on this season's ladders. ` +
          `Try the numeric persona id from their ra3battle.cn profile URL.`,
      );
      return;
    }
    const [stats, history] = await Promise.all([
      ra3StatsService.getRa3bPersonaStats(personaId).catch(() => null),
      ra3StatsService.getRa3bPersonaHistory(personaId).catch(() => []),
    ]);
    if (!stats) {
      await interaction.editReply(`No RA3BattleNet stats found for persona id ${personaId}.`);
      return;
    }
    const embed = new EmbedBuilder()
      .setTitle(`🏅 ${stats.personaName} — ${t(lang, 'profile.playerProfile')}`)
      .setColor(0xffd700)
      .setDescription(t(lang, 'profile.communityPlayer'));
    embed.addFields({
      name: t(lang, 'profile.ra3b'),
      value: (await buildRa3bLines(stats, history, playerQuery, lang)).join('\n').slice(0, 1024),
      inline: false,
    });
    // Tournament Wins leaderboard, when this name has recorded titles.
    const wins = (await ra3StatsService.fetch().catch(() => null))?.tournament_wins ?? {};
    const winCount =
      wins[stats.personaName] ??
      Object.entries(wins).find(([n]) => n.toLowerCase() === stats.personaName.toLowerCase())?.[1];
    if (winCount) {
      embed.addFields({ name: `🏆 ${t(lang, 'profile.tournamentWins')}`, value: `${winCount}`, inline: true });
    }
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const target = interaction.options.getUser('user') || interaction.user;
  const user = userRepository.findByDiscordId(target.id);

  const embed = new EmbedBuilder()
    .setTitle(`🏅 ${target.displayName}${t(lang, 'profile.title')}`)
    .setColor(0xffd700)
    .setThumbnail(target.displayAvatarURL());

  // Shatabrick (C&C Online ladder) — linked account + community rank.
  // RA3BattleNet is looked up live below: the two platforms use different
  // rating systems, so each gets its own label.
  if (user?.shatabrickUsername) {
    embed.addFields({
      name: t(lang, 'profile.shatabrick'),
      value:
        `**${user.shatabrickUsername}**\n` +
        `${t(lang, 'profile.rank')}: ${user.rank || '—'}\n` +
        t(lang, 'profile.apiPending'),
      inline: true,
    });
  } else {
    embed.setDescription(t(lang, 'profile.noLink'));
    embed.addFields({
      name: t(lang, 'profile.shatabrick'),
      value:
        `${t(lang, 'profile.notFound')}\n${t(lang, 'profile.rank')}: ${user?.rank || '—'}\n` +
        t(lang, 'profile.noLink'),
      inline: true,
    });
  }

  // RA3BattleNet is separate from Shatabrick, so only query it with the
  // persona the user explicitly linked through /link. The
  // stored numeric persona id works even off-season; otherwise resolve by
  // name through the current ladders.
  const ra3bLinked = user?.ra3bUsername;
  if (ra3bLinked) {
    const personaId =
      user?.ra3bPersonaId ??
      (await ra3StatsService.findRa3bPersonaId(ra3bLinked).catch(() => null));
    if (personaId) {
      const [stats, history] = await Promise.all([
        ra3StatsService.getRa3bPersonaStats(personaId).catch(() => null),
        ra3StatsService.getRa3bPersonaHistory(personaId).catch(() => []),
      ]);
      embed.addFields({
        name: t(lang, 'profile.ra3b'),
        value: (await buildRa3bLines(stats, history, ra3bLinked, lang)).join('\n').slice(0, 1024),
        inline: false,
      });
    } else {
      // Not on this season's ladders — fall back to the cached top-10 view.
      const ra3b = await ra3StatsService.findRA3BattleNetPlayer(ra3bLinked).catch(() => null);
      embed.addFields({
        name: t(lang, 'profile.ra3b'),
        value: ra3b
          ? `${ra3b.personaName}\n${t(lang, 'profile.elo')}: \`${ra3b.elo}\` (${ra3b.mode})`
          : t(lang, 'profile.notFound'),
        inline: false,
      });
    }
  } else {
    embed.addFields({
      name: t(lang, 'profile.ra3b'),
      value: t(lang, 'profile.ra3bNoLink'),
      inline: true,
    });
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
