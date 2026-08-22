import {
  ButtonInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { trackedStreamerRepository } from '../../repositories/tracked-streamer.repository';

export const customId = 'tracked_streamers';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });
  if (!interaction.guild) {
    await interaction.editReply({ content: 'Server only.' });
    return;
  }
  const streamers = trackedStreamerRepository.findByGuild(interaction.guild.id);
  const embed = new EmbedBuilder()
    .setTitle('📡 Tracked Streamers')
    .setDescription(
      streamers.length
        ? streamers.map((s) => `• **${s.displayName}** (${s.platform})`).join('\n')
        : 'No tracked streamers.',
    )
    .setColor(0x5865f2);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('add_streamer')
      .setLabel('➕ Add Streamer')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('remove_streamer')
      .setLabel('➖ Remove Streamer')
      .setStyle(ButtonStyle.Danger),
  );
  await interaction.editReply({ embeds: [embed], components: [row] });
}
