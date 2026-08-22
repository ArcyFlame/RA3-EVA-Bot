import { StringSelectMenuInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { wizardViews } from '../../commands/notifications/views';

export const customId = 'global_channel_select';

export async function execute(_bot: RA3Bot, interaction: StringSelectMenuInteraction) {
  if (!interaction.message) return;
  const view = wizardViews.get(interaction.message.id);
  if (!view) {
    await interaction.reply({
      content: 'Session expired. Please reopen the wizard using the button below.',
      ephemeral: true,
    });
    return;
  }
  if (view.ownerId !== interaction.user.id) {
    await interaction.reply({ content: 'Not your wizard.', ephemeral: true });
    return;
  }
  await view.handleSelect(interaction);
}
