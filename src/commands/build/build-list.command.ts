import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { RA3Bot } from '../../bot';
import { buildOrderRepository, BuildOrder } from '../../repositories/build-order.repository';

export const data = new SlashCommandBuilder()
  .setName('build_list')
  .setDescription('List build orders (yours and the newest community builds)');

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  const mine: BuildOrder[] = buildOrderRepository.getUserOrders(interaction.user.id);
  const latest: BuildOrder[] = buildOrderRepository.getRecentOrders(15);

  const mineLines = mine
    .slice(0, 25)
    .map((o) => `• **${o.name.slice(0, 50)}** (${new Date(o.createdAt).toLocaleDateString()})`);
  const latestLines = latest
    .filter((o) => o.userId !== interaction.user.id)
    .slice(0, 10)
    .map((o) => `• **${o.name.slice(0, 50)}** by <@${o.userId}>`);

  const embed = new EmbedBuilder()
    .setTitle('Build Orders')
    .setColor(0x00ae86)
    .addFields(
      {
        name: 'Your Build Orders',
        value: mineLines.join('\n') || 'None yet. Create one with /build_create.',
        inline: false,
      },
      {
        name: 'Newest Community Builds',
        value: latestLines.join('\n') || 'No community builds yet.',
        inline: false,
      },
    );
  await interaction.reply({ embeds: [embed], ephemeral: true });
}
