import { StringSelectMenuInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { trackedStreamerRepository } from '../../repositories/tracked-streamer.repository';

export const customId = 'remove_streamer_select';

export async function execute(_bot: RA3Bot, interaction: StringSelectMenuInteraction) {
  if (!interaction.guild) return;
  const platformId = interaction.values[0];
  const removed = trackedStreamerRepository.removeStreamer(interaction.guild.id, platformId);
  if (removed) {
    await interaction.reply({ content: '✅ Streamer removed from tracking.', ephemeral: true });
  } else {
    await interaction.reply({ content: '❌ Streamer not found.', ephemeral: true });
  }
}
