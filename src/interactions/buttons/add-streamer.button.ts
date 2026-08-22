import {
  ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import { RA3Bot } from '../../bot';

export const customId = 'add_streamer';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  const modal = new ModalBuilder().setCustomId('add_streamer_modal').setTitle('Add Streamer');
  const platformInput = new TextInputBuilder()
    .setCustomId('platform')
    .setLabel('Platform (twitch / youtube)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  const identifierInput = new TextInputBuilder()
    .setCustomId('identifier')
    .setLabel('Twitch name / YouTube handle or ID')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(platformInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(identifierInput),
  );
  await interaction.showModal(modal);
}
