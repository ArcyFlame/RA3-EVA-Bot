import {
  ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { authorizeReminderControl } from '../../utils/match-reminder-controls';

export const customIdPrefix = 'delay_match_';

export async function execute(bot: RA3Bot, interaction: ButtonInteraction) {
  const reminder = await authorizeReminderControl(bot.client, interaction, customIdPrefix);
  if (!reminder) return;
  const modal = new ModalBuilder()
    .setCustomId(`delay_modal_v1_${reminder.id}`)
    .setTitle('Request Delay');
  const input = new TextInputBuilder()
    .setCustomId('minutes')
    .setLabel('Minutes (5-30)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  await interaction.showModal(modal);
}
