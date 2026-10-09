import { ButtonInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { NotificationsMainView } from '../../commands/notifications/views';
import { requireAdminInteraction } from '../../utils/admin-interaction';

export const customId = 'setup_notify_channels';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Server only.', ephemeral: true });
    return;
  }
  if (!(await requireAdminInteraction(interaction))) return;
  const view = new NotificationsMainView(true);
  await interaction.reply({
    embeds: [view.buildEmbed()],
    components: view.getComponents(),
    ephemeral: true,
  });
}
