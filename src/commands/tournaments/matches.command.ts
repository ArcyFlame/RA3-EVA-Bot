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
import { buildStandingsFields } from './results.utils';
import { logger } from '../../utils/logger';
import { getCurrentTournament } from '../../services/tournament-context.service';
import { ESPORTS_FALLBACK_URL } from '../../utils/tournament-status';

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

  const guildGame = guildData?.game ?? 'ra3';
  const current = getCurrentTournament(guildGame);
  const currentRef = current?.challongeUrl
    ? challongeService.parseTournamentRef(current.challongeUrl)
    : null;
  const linkedId = tournamentRepository.getLinkedTournamentId(interaction.guild.id);
  const linkedRef = linkedId ? challongeService.parseTournamentRef(linkedId) : null;
  // Never pick an arbitrary historical bracket. A manually linked bracket is
  // only a fallback when no current portal event exists.
  const challongeId = currentRef ?? (!current ? linkedRef : null);
  if (!challongeId) {
    await interaction.editReply({
      content: 'No verified bracket is available for the current tournament.',
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setLabel('View RA3 Tournaments')
            .setStyle(ButtonStyle.Link)
            .setURL(ESPORTS_FALLBACK_URL),
        ),
      ],
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
    if (!current && tournament.state === 'complete') {
      await interaction.editReply({
        content: 'The linked bracket has ended, and no current tournament was found.',
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setLabel('View RA3 Tournaments')
              .setStyle(ButtonStyle.Link)
              .setURL(ESPORTS_FALLBACK_URL),
          ),
        ],
      });
      return;
    }
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

    const reportEventId = currentRef ? current?.id : undefined;
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
