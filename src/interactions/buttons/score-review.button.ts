import { ButtonInteraction, EmbedBuilder } from 'discord.js';
import { RA3Bot } from '../../bot';
import { tournamentRepository } from '../../repositories/tournament.repository';
import { challongeService } from '../../services/challonge.service';
import { isAdminOrReferee } from '../../utils/permissions';
import { parseIntSafe } from '../../utils/parse';
import { logger } from '../../utils/logger';

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

  const guild = bot.client.guilds.cache.get(guildId);
  const member = guild ? await guild.members.fetch(interaction.user.id).catch(() => null) : null;
  if (!member || !isAdminOrReferee(member)) {
    await interaction.reply({ content: 'Referees and admins only.', ephemeral: true });
    return;
  }

  const report = tournamentRepository.getMatchReport(reportId);
  if (!report) {
    await interaction.reply({ content: 'This score report no longer exists.', ephemeral: true });
    return;
  }
  if (report.status !== 'pending') {
    await interaction.reply({ content: `This report is already ${report.status}.`, ephemeral: true });
    return;
  }

  await interaction.deferUpdate();
  let syncWarning = '';
  if (action === 'approve' && /^\d+$/.test(report.challongeMatchId) && !report.tournamentId.startsWith('event:')) {
    try {
      const matchId = Number(report.challongeMatchId);
      const match = (await challongeService.getMatches(report.tournamentId)).find(
        (entry) => entry.id === matchId,
      );
      if (match?.player1Id != null && match.player2Id != null && report.winnerId) {
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
        syncWarning = ' The exact open Challonge match could not be confirmed, so only the bot score list was updated.';
      }
    } catch (error) {
      logger.warn(`Could not sync approved score report ${reportId} to Challonge:`, error);
      syncWarning = ' Challonge could not be updated, so the approved result remains in the bot score list.';
    }
  }

  const status = action === 'approve' ? 'approved' : 'rejected';
  const changed = tournamentRepository.reviewMatchReport(reportId, status, interaction.user.id);
  if (!changed) {
    await interaction.followUp({ content: 'Another referee already reviewed this report.', ephemeral: true });
    return;
  }

  const oldEmbed = interaction.message.embeds[0];
  const embed = oldEmbed
    ? EmbedBuilder.from(oldEmbed)
        .setColor(action === 'approve' ? 0x57f287 : 0xed4245)
        .addFields({ name: 'Review', value: `${status} by <@${interaction.user.id}>`, inline: false })
    : new EmbedBuilder().setTitle(`Score report #${reportId}`).setColor(action === 'approve' ? 0x57f287 : 0xed4245);
  await interaction.editReply({
    content: `${action === 'approve' ? '✅ Approved.' : '❌ Rejected.'}${syncWarning}`,
    embeds: [embed],
    components: [],
  });
}
