import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import { RA3Bot } from '../../bot';

export const data = new SlashCommandBuilder()
  .setName('build_create')
  .setDescription('Create a build order (interactive, unit emojis supported)');

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  const modal = new ModalBuilder().setCustomId('build_create_modal').setTitle('Create a Build Order');

  const nameInput = new TextInputBuilder()
    .setCustomId('name')
    .setLabel('Build name')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(50);

  const contentInput = new TextInputBuilder()
    .setCustomId('content')
    .setLabel('Build order (unit emojis work)')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1900);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(contentInput),
  );

  await interaction.showModal(modal);
}
