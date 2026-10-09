import { ButtonInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { tournamentRepository } from '../../repositories/tournament.repository';
import { authorizeReminderControl } from '../../utils/match-reminder-controls';

export const customIdPrefix = 'confirm_match_';

export async function execute(bot: RA3Bot, interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const reminder = await authorizeReminderControl(bot.client, interaction, customIdPrefix);
  if (!reminder) return;
  tournamentRepository.confirmMatch(reminder.id, interaction.user.id);
  await interaction.editReply({ content: '✅ You are ready!' });
}
