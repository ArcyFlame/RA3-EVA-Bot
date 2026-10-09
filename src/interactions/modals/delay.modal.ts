import { ModalSubmitInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { tournamentRepository } from '../../repositories/tournament.repository';
import { parseIntSafe } from '../../utils/parse';
import { authorizeReminderControl } from '../../utils/match-reminder-controls';

export const customIdPrefix = 'delay_modal_';

export async function execute(bot: RA3Bot, interaction: ModalSubmitInteraction) {
  const reminder = await authorizeReminderControl(bot.client, interaction, customIdPrefix);
  if (!reminder) return;
  const minutes = parseIntSafe(interaction.fields.getTextInputValue('minutes').trim());
  if (minutes === null || minutes < 5 || minutes > 30) {
    await interaction.reply({
      content: 'Delay must be between 5 and 30 minutes.',
      ephemeral: true,
    });
    return;
  }
  tournamentRepository.recordDelay(reminder.id, interaction.user.id, minutes);
  await interaction.reply({ content: `✅ Requested a ${minutes}-minute delay.`, ephemeral: true });
}
