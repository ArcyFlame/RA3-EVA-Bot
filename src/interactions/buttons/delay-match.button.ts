import {
  ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { parseCustomIdInt } from '../../utils/parse';

export const customIdPrefix = 'delay_match_';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  const matchId = parseCustomIdInt(interaction.customId, 2);
  if (matchId === null) {
    await interaction.reply({ content: 'Invalid match.', ephemeral: true });
    return;
  }
  const modal = new ModalBuilder().setCustomId(`delay_modal_${matchId}`).setTitle('Request Delay');
  const input = new TextInputBuilder()
    .setCustomId('minutes')
    .setLabel('Minutes (5-30)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  await interaction.showModal(modal);
}
