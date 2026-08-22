import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { challongeService } from '../../services/challonge.service';
import { tournamentRepository } from '../../repositories/tournament.repository';
import { guildRepository } from '../../repositories/guild.repository';
import { matchesGuildGame, buildStandingsFields } from './results.utils';
import { logger } from '../../utils/logger';
import { getCurrentTournament } from '../../services/tournament-context.service';

export const data = new SlashCommandBuilder()
  .setName('matches')
  .setDescription('Current tournament bracket: results, scores and upcoming matches');

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Server only.', ephemeral: true });
    return;
  }

  const guildData = guildRepository.findByDiscordId(interaction.guild.id);
  if (guildData?.tournamentsEnabled === 0) {
    await interaction.reply({
      content: '❌ Tournaments are disabled on this server.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  // Prefer the newest bracket discovered from the GameReplays forum that
  // belongs to this server's game (RA3 servers never get the GenEvo bracket);
  // fall back to the guild-linked Challonge tournament.
  const guildGame = guildData?.game ?? 'ra3';
  const discovered = tournamentRepository
    .getEventsWithChallonge()
    .find((e) => matchesGuildGame(e.title, guildGame));
  const linkedId = tournamentRepository.getLinkedTournamentId(interaction.guild.id);
  const challongeId = discovered
    ? challongeService.parseTournamentRef(discovered.challongeUrl)
    : linkedId || null;
  if (!challongeId) {
    await interaction.editReply({
      content:
        'No Challonge bracket found yet. Run `/tournaments_scan` to discover brackets, or link one with `/tournament_link`.',
    });
    return;
  }

  try {
    const [tournament, matches, participants, rankings] = await Promise.all([
      challongeService.getTournament(challongeId),
      challongeService.getMatches(challongeId),
      challongeService.getParticipants(challongeId),
      challongeService.getFinalRankings(challongeId).catch(() => []),
    ]);
    const names: Record<number, string> = {};
    for (const p of participants) names[p.id] = p.name;

    const embed = new EmbedBuilder()
      .setTitle(`🏆 ${tournament.name}`)
      .setURL(challongeService.bracketUrl(challongeId))
      .setColor(0x5865f2);

    const headerBits: string[] = [];
    if (tournament.participants_count) headerBits.push(`Players: ${tournament.participants_count}`);
    if (tournament.tournament_type) {
      headerBits.push(
        `Format: ${String(tournament.tournament_type).replace(/_/g, ' ')}`,
      );
    }
    if (tournament.game_name) headerBits.push(String(tournament.game_name));
    if (tournament.state) headerBits.push(`Status: ${String(tournament.state).toUpperCase()}`);
    embed.setDescription(headerBits.join('\n'));

    const startedAt = tournament.started_at || tournament.start_at;
    if (startedAt) {
      embed.addFields({
        name: 'Start',
        value: new Date(startedAt).toLocaleString(),
        inline: true,
      });
    }

    const done = matches.filter((m) => m.state === 'complete');
    // Best-of inferred from the highest games count in any scores line.
    const bestOf = Math.max(
      0,
      ...done.map((m) => (m.scoresCsv || '').split('-').filter(Boolean).length),
    );
    if (bestOf >= 3) {
      embed.addFields({ name: 'Series', value: `Best of ${bestOf}`, inline: true });
    }

    // Final standings — same podium + numbered-standings view as /results.
    if (rankings.length > 0) {
      embed.addFields(...buildStandingsFields(rankings));
    } else {
      // Bracket in progress: compact recent results (winner per series,
      // no raw per-game score spam).
      const completed = matches
        .filter((m) => m.state === 'complete' && m.winnerId)
        .sort((a, b) => (b.round ?? 0) - (a.round ?? 0))
        .slice(0, 5);
      if (completed.length > 0) {
        embed.addFields({
          name: 'Results',
          value: completed
            .map((m) => {
              const p1 = names[m.player1Id ?? 0] || 'TBD';
              const p2 = names[m.player2Id ?? 0] || 'TBD';
              const winner = m.winnerId === m.player1Id ? p1 : p2;
              return `\`R${m.round ?? '?'}\` ${p1} vs ${p2} → **${winner}**`;
            })
            .join('\n')
            .slice(0, 1024),
          inline: false,
        });
      }
    }

    const reportEventId = discovered?.id ?? getCurrentTournament(guildGame)?.id;
    if (reportEventId) {
      const reports = tournamentRepository.getApprovedReports(reportEventId, 5);
      if (reports.length > 0) {
        embed.addFields({
          name: 'Referee-approved score reports',
          value: reports
            .map(
              (report) =>
                `${report.reporterName ?? 'Player 1'} **${report.player1Score}–${report.player2Score}** ${report.opponentName ?? 'Player 2'}${report.factionMatchup ? ` · ${report.factionMatchup}` : ''}`,
            )
            .join('\n')
            .slice(0, 1024),
          inline: false,
        });
      }
    }

    // Upcoming matches (who is next).
    const open = matches.filter((m) => m.state === 'open' || m.state === 'pending').slice(0, 5);
    if (open.length > 0) {
      embed.addFields({
        name: 'Up Next',
        value: open
          .map((m) => {
            const p1 = names[m.player1Id ?? 0] || 'TBD';
            const p2 = names[m.player2Id ?? 0] || 'TBD';
            const time = m.scheduledTime
              ? ` at ${new Date(m.scheduledTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : '';
            return `\`R${m.round ?? '?'}\` ${p1} vs ${p2}${time}`;
          })
          .join('\n')
          .slice(0, 1024),
        inline: false,
      });
    } else if (done.length > 0) {
      embed.addFields({ name: 'Up Next', value: 'All matches completed.', inline: false });
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel('Open Bracket')
        .setStyle(ButtonStyle.Link)
        .setURL(challongeService.bracketUrl(challongeId)),
    );
    await interaction.editReply({ embeds: [embed], components: [row] });
  } catch (error) {
    logger.error('matches: failed to fetch bracket:', error);
    await interaction.editReply({ content: 'Could not load the tournament bracket.' });
  }
}
