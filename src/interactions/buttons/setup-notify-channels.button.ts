import { ButtonInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { NotificationsMainView } from '../../commands/notifications/views';
import { isAdmin } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';

export const customId = 'setup_notify_channels';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Server only.', ephemeral: true });
    return;
  }
  const member = await resolveMember(interaction);
  const userIsAdmin = member !== null && isAdmin(member);
  const view = new NotificationsMainView(userIsAdmin);
  await interaction.reply({
    embeds: [view.buildEmbed()],
    components: view.getComponents(),
    ephemeral: true,
  });
}
