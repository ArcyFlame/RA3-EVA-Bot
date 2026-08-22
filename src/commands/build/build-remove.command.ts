import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { buildOrderRepository } from '../../repositories/build-order.repository';

export const data = new SlashCommandBuilder()
  .setName('build_remove')
  .setDescription('Remove one of your saved build orders')
  .addStringOption((opt) => opt.setName('name').setDescription('Build name').setRequired(true));

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  const name = interaction.options.getString('name', true);
  const deleted = buildOrderRepository.deleteOrder(interaction.user.id, name);
  if (deleted) {
    await interaction.reply({ content: `Build order **${name}** removed.`, ephemeral: true });
  } else {
    await interaction.reply({ content: 'Build order not found.', ephemeral: true });
  }
}
