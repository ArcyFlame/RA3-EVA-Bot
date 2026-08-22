import { ModalSubmitInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { tournamentRepository } from '../../repositories/tournament.repository';
import { parseCustomIdInt, parseIntSafe } from '../../utils/parse';

export const customIdPrefix = 'delay_modal_';

export async function execute(_bot: RA3Bot, interaction: ModalSubmitInteraction) {
  const matchId = parseCustomIdInt(interaction.customId, 2);
  if (matchId === null) {
    await interaction.reply({ content: 'Invalid match.', ephemeral: true });
    return;
  }
  const minutes = parseIntSafe(interaction.fields.getTextInputValue('minutes').trim());
  if (minutes === null || minutes < 5 || minutes > 30) {
    await interaction.reply({
      content: 'Delay must be between 5 and 30 minutes.',
      ephemeral: true,
    });
    return;
  }
  tournamentRepository.recordDelay(String(matchId), interaction.user.id, minutes);
  await interaction.reply({ content: `✅ Requested a ${minutes}-minute delay.`, ephemeral: true });
}
