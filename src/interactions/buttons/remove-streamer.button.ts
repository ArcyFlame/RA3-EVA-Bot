import {
  ButtonInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { trackedStreamerRepository } from '../../repositories/tracked-streamer.repository';

export const customId = 'remove_streamer';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Server only.', ephemeral: true });
    return;
  }
  const streamers = trackedStreamerRepository.findByGuild(interaction.guild.id);
  if (streamers.length === 0) {
    await interaction.reply({ content: 'No tracked streamers to remove.', ephemeral: true });
    return;
  }
  const options = streamers.map((s) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(`${s.displayName} (${s.platform})`)
      .setValue(s.platformId),
  );
  const select = new StringSelectMenuBuilder()
    .setCustomId('remove_streamer_select')
    .setPlaceholder('Select a streamer to remove')
    .addOptions(options);
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
  await interaction.reply({
    content: 'Select a streamer to remove:',
    components: [row],
    ephemeral: true,
  });
}
