import { ButtonInteraction, Message } from 'discord.js';
import { RA3Bot } from '../../bot';
import { GuildChannelsWizardView, wizardViews } from '../../commands/notifications/views';
import { requireAdminInteraction } from '../../utils/admin-interaction';

export const customId = 'global_channels';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Server only.', ephemeral: true });
    return;
  }
  if (!(await requireAdminInteraction(interaction))) return;

  const view = new GuildChannelsWizardView(interaction.guild, interaction.user.id);
  const reply = await interaction.reply({
    embeds: [view.buildEmbed()],
    components: view.getComponents(),
    fetchReply: true,
    // Ephemeral: only the admin who opened it can see/press these buttons.
    ephemeral: true,
  });
  view.setOriginalMessage(reply as Message);
  wizardViews.set(reply.id, view);

  setTimeout(
    () => {
      wizardViews.delete(reply.id);
    },
    10 * 60 * 1000,
  ).unref();
}
