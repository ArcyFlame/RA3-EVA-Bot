import { ButtonInteraction, EmbedBuilder } from 'discord.js';
import { RA3Bot } from '../../bot';
import { tournamentRepository } from '../../repositories/tournament.repository';
import { challongeService } from '../../services/challonge.service';
import { canManageTournament } from '../../utils/tournament-access';
import { isAdminOrReferee } from '../../utils/permissions';
import { parseIntSafe } from '../../utils/parse';
import { logger } from '../../utils/logger';
import { tournamentAccessRepository } from '../../repositories/tournament-access.repository';

export const customIdPrefix = 'score_review_';

export async function execute(bot: RA3Bot, interaction: ButtonInteraction) {
  const parts = interaction.customId.split('_');
  const action = parts[2];
  const reportId = parseIntSafe(parts[3]);
  const guildId = parts[4];
  if (!reportId || !guildId || (action !== 'approve' && action !== 'reject')) {
    await interaction.reply({ content: 'Invalid score-review button.', ephemeral: true });
    return;
  }

  const report = tournamentRepository.getMatchReport(reportId);
  if (!report) {
    await interaction.reply({ content: 'This score report no longer exists.', ephemeral: true });
    return;
  }
  if (
    !report.eventId ||
    report.guildId !== guildId ||
    (interaction.guildId && interaction.guildId !== guildId)
  ) {
    await interaction.reply({
      content:
        'This review is not bound to its original organizer server. Submit a new report if this is an older request.',
      ephemeral: true,
    });
    return;
  }
  const guild = bot.client.guilds.cache.get(report.guildId);
  const member = guild
    ? await guild.members.fetch({ user: interaction.user.id, force: true }).catch(() => null)
    : null;
  if (!member || !isAdminOrReferee(member) || !canManageTournament(member, report.eventId)) {
    await interaction.reply({
      content: 'Only authorized organizer staff can review this report.',
      ephemeral: true,
    });
    return;
  }
  if (report.status !== 'pending') {
    await interaction.reply({
      content: `This report is already ${report.status}.`,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferUpdate();
  const status = action === 'approve' ? 'approved' : 'rejected';
  // Claim the pending transition before any provider call. Concurrent clicks
  // cannot both write the remote score.
  if (
    !canManageTournament(member, report.eventId) ||
    !tournamentRepository.reviewMatchReport(reportId, status, interaction.user.id)
  ) {
    await interaction.followUp({
      content: 'This report is no longer available for your review.',
      ephemeral: true,
    });
    return;
  }
  let syncWarning = '';
  if (
    action === 'approve' &&
    /^\d+$/.test(report.challongeMatchId) &&
    !report.tournamentId.startsWith('event:')
  ) {
    try {
      const bindingValid = () => {
        if (
          tournamentAccessRepository.writableBracket(report.eventId!, report.tournamentId) !==
          report.tournamentId
        )
          return false;
        const players = tournamentRepository.getParticipants(report.eventId!);
        const reporter = players.find((p) => p.id === report.reporterParticipantId);
        const opponent = players.find((p) => p.id === report.opponentParticipantId);
        return (
          !!reporter &&
          !!opponent &&
          reporter.id !== opponent.id &&
          reporter.bindingVerified &&
          reporter.discordId === report.reportedBy &&
          opponent.bindingVerified &&
          reporter.externalTournamentId === report.tournamentId &&
          opponent.externalTournamentId === report.tournamentId &&
          reporter.externalParticipantId === report.player1Id &&
          opponent.externalParticipantId === report.player2Id
        );
      };
      if (!bindingValid())
        throw new Error('Remote bracket or participant ownership is not verified');
      const matchId = Number(report.challongeMatchId);
      const match = (await challongeService.getMatches(report.tournamentId)).find(
        (entry) => entry.id === matchId,
      );
      const playersMatch =
        match?.player1Id != null &&
        match.player2Id != null &&
        [String(match.player1Id), String(match.player2Id)].sort().join(',') ===
          [report.player1Id, report.player2Id].sort().join(',');
      const winner =
        report.player1Score > report.player2Score ? report.player1Id : report.player2Id;
      const fresh = guild
        ? await guild.members.fetch({ user: interaction.user.id, force: true }).catch(() => null)
        : null;
      if (
        match?.state === 'open' &&
        String(match.tournamentId) === report.tournamentId &&
        playersMatch &&
        bindingValid() &&
        report.winnerId === winner &&
        !!fresh &&
        isAdminOrReferee(fresh) &&
        canManageTournament(fresh, report.eventId)
      ) {
        const reporterIsPlayer1 = String(match.player1Id) === report.player1Id;
        const score1 = reporterIsPlayer1 ? report.player1Score : report.player2Score;
        const score2 = reporterIsPlayer1 ? report.player2Score : report.player1Score;
        await challongeService.updateMatchScore(
          report.tournamentId,
          matchId,
          `${score1}-${score2}`,
          Number(report.winnerId),
        );
      } else {
        syncWarning =
          ' The exact open Challonge match could not be confirmed, so only the bot score list was updated.';
      }
    } catch (error) {
      logger.warn(`Could not sync approved score report ${reportId} to Challonge:`, error);
      syncWarning =
        ' Challonge could not be updated, so the approved result remains in the bot score list.';
    }
  }

  const oldEmbed = interaction.message.embeds[0];
  const embed = oldEmbed
    ? EmbedBuilder.from(oldEmbed)
        .setColor(action === 'approve' ? 0x57f287 : 0xed4245)
        .addFields({
          name: 'Review',
          value: `${status} by <@${interaction.user.id}>`,
          inline: false,
        })
    : new EmbedBuilder()
        .setTitle(`Score report #${reportId}`)
        .setColor(action === 'approve' ? 0x57f287 : 0xed4245);
  await interaction.editReply({
    content: `${action === 'approve' ? '✅ Approved.' : '❌ Rejected.'}${syncWarning}`,
    embeds: [embed],
    components: [],
  });
}
