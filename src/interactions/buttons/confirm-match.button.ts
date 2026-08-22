import { ButtonInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { tournamentRepository } from '../../repositories/tournament.repository';
import { parseIntSafe } from '../../utils/parse';

export const customIdPrefix = 'confirm_match_';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  const matchId = parseIntSafe(interaction.customId.split('_')[2]);
  if (matchId === null) {
    await interaction.reply({ content: 'Invalid match.', ephemeral: true });
    return;
  }
  tournamentRepository.confirmMatch(String(matchId), interaction.user.id);
  await interaction.reply({ content: '✅ You are ready!', ephemeral: true });
}
