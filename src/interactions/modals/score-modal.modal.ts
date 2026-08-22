import { ModalSubmitInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { tournamentRepository } from '../../repositories/tournament.repository';
import { parseCustomIdInt } from '../../utils/parse';

export const customIdPrefix = 'score_modal_';

/**
 * Records a user-reported match result for referee review.
 *
 * customId contract: `score_modal_<matchId>_<player1Id>_<player2Id>` - the
 * three Challonge ids are embedded by report-score.command.ts. All fields are
 * validated before touching the database.
 */
export async function execute(_bot: RA3Bot, interaction: ModalSubmitInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Server only.', ephemeral: true });
    return;
  }

  const matchId = parseCustomIdInt(interaction.customId, 2);
  const player1Id = parseCustomIdInt(interaction.customId, 3);
  const player2Id = parseCustomIdInt(interaction.customId, 4);
  if (matchId === null || player1Id === null || player2Id === null) {
    await interaction.reply({ content: '❌ Invalid match data.', ephemeral: true });
    return;
  }

  const tournamentId = tournamentRepository.getLinkedTournamentId(interaction.guild.id);
  if (!tournamentId) {
    await interaction.reply({
      content: '❌ No active tournament linked. Ask an admin to link one.',
      ephemeral: true,
    });
    return;
  }

  const scoreStr = interaction.fields.getTextInputValue('score');
  const proof = interaction.fields.getTextInputValue('proof').trim().slice(0, 500) || null;
  if (proof && !/^https?:\/\//i.test(proof)) {
    await interaction.reply({ content: '❌ Proof must be an http(s) URL.', ephemeral: true });
    return;
  }

  const scoreParts = scoreStr.split('-').map((s) => parseInt(s.trim(), 10));
  if (scoreParts.length !== 2 || !scoreParts.every((n) => Number.isInteger(n) && n >= 0)) {
    await interaction.reply({
      content: '❌ Invalid score format. Use like `3-1`.',
      ephemeral: true,
    });
    return;
  }

  const [player1Score, player2Score] = scoreParts;
  const winnerId =
    player1Score > player2Score
      ? String(player1Id)
      : player2Score > player1Score
        ? String(player2Id)
        : null;

  tournamentRepository.insertMatch({
    tournamentId,
    challongeMatchId: String(matchId),
    player1Id: String(player1Id),
    player2Id: String(player2Id),
    player1Score,
    player2Score,
    winnerId,
    reportedBy: interaction.user.id,
    proofUrl: proof,
  });

  await interaction.reply({
    content: '✅ Match reported! The result will be reviewed by a referee.',
    ephemeral: true,
  });
}
