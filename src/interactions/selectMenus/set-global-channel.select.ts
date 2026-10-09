import { ChannelSelectMenuInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { wizardViews } from '../../commands/notifications/views';

export const customIdPrefix = 'set_global_channel_';

export async function execute(bot: RA3Bot, interaction: ChannelSelectMenuInteraction) {
  if (!interaction.message) return;
  const view = wizardViews.get(interaction.message.id);
  if (!view) {
    await interaction.reply({
      content: 'Session expired. Please reopen the wizard.',
      ephemeral: true,
    });
    return;
  }
  if (view.ownerId !== interaction.user.id) {
    await interaction.reply({ content: 'Not your wizard.', ephemeral: true });
    return;
  }

  await view.handleChannelSet(bot.client, interaction);
}
