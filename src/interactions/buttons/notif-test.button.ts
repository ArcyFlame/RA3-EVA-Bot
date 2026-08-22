import { ButtonInteraction, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { RA3Bot } from '../../bot';

/** Opens the test-post menu from the admin /notifications view. */
export const customId = 'notif_test';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const select = new StringSelectMenuBuilder()
    .setCustomId('notif_test_select')
    .setPlaceholder('Send a test post to the configured channel…')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('Twitch')
        .setDescription('Post a live RA3 stream (or synthetic test) to the Twitch channel')
        .setValue('twitch')
        .setEmoji('📺'),
      new StringSelectMenuOptionBuilder()
        .setLabel('ModDB')
        .setDescription('Post the newest RA3 ModDB item to the ModDB channel')
        .setValue('moddb')
        .setEmoji('📦'),
      new StringSelectMenuOptionBuilder()
        .setLabel('News')
        .setDescription('Post the newest RA3 news to the News channel')
        .setValue('news')
        .setEmoji('📰'),
    );
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
  await interaction.editReply({
    content: '🧪 Which pipeline should send a test post?',
    components: [row],
  });
}
