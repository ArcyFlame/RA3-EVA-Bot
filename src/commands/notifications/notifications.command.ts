import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { isAdmin } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';
import { NotificationsMainView } from './views';

export const data = new SlashCommandBuilder()
  .setName('notifications')
  .setDescription('Configure all notification settings');

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
  if (!interaction.guild) {
    await interaction.editReply({ content: 'Server only.' });
    return;
  }
  const member = await resolveMember(interaction);
  const userIsAdmin = member !== null && isAdmin(member);
  const view = new NotificationsMainView(userIsAdmin);
  await interaction.editReply({ embeds: [view.buildEmbed()], components: view.getComponents() });
}
