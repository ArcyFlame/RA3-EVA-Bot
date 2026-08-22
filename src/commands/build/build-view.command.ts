import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { RA3Bot } from '../../bot';
import { buildOrderRepository } from '../../repositories/build-order.repository';

export const data = new SlashCommandBuilder()
  .setName('build_view')
  .setDescription('View a saved build order')
  .addStringOption((opt) => opt.setName('name').setDescription('Build name').setRequired(true))
  .addUserOption((opt) =>
    opt.setName('author').setDescription('Whose build (defaults to you)').setRequired(false),
  );

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  const name = interaction.options.getString('name', true);
  const author = interaction.options.getUser('author') ?? interaction.user;
  const order = buildOrderRepository.getOrder(author.id, name);
  if (!order) {
    await interaction.reply({
      content: `No build order named **${name}** by <@${author.id}>.`,
      ephemeral: true,
    });
    return;
  }
  const content =
    order.content.length > 4096 ? `${order.content.slice(0, 4093)}...` : order.content;
  const embed = new EmbedBuilder()
    .setTitle(`Build Order: ${order.name.slice(0, 200)}`)
    .setDescription(content)
    .setColor(0x00ae86)
    .addFields({ name: 'Author', value: `<@${order.userId}>`, inline: true })
    .setFooter({ text: `Created on ${new Date(order.createdAt).toLocaleDateString()}` });
  await interaction.reply({ embeds: [embed], ephemeral: true });
}
