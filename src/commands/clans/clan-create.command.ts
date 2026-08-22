import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { guildRepository } from '../../repositories/guild.repository';

export const data = new SlashCommandBuilder()
  .setName('clan_create')
  .setDescription('Create a new clan');

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Server only.', ephemeral: true });
    return;
  }

  // Feature check
  const guildData = await guildRepository.findByDiscordId(interaction.guild.id);
  if (guildData?.clansEnabled === 0) {
    await interaction.reply({
      content: '❌ Clan system is disabled on this server.',
      ephemeral: true,
    });
    return;
  }

  const modal = new ModalBuilder().setCustomId('clan_create_modal').setTitle('Create a Clan');

  const nameInput = new TextInputBuilder()
    .setCustomId('name')
    .setLabel('Clan Name')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(50);

  const tagInput = new TextInputBuilder()
    .setCustomId('tag')
    .setLabel('Clan Tag (1-6 chars)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(6);

  const descInput = new TextInputBuilder()
    .setCustomId('description')
    .setLabel('Description (optional)')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(500);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(tagInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(descInput),
  );

  await interaction.showModal(modal);
}
