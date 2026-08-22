import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { isAdmin } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';
import { NotificationsMainView } from './views';
import { userRepository } from '../../repositories/user.repository';

export const data = new SlashCommandBuilder()
  .setName('notifications')
  .setDescription('Manage your notifications and language');

export const guildOnly = false;
export const dmAlwaysAllowed = true;

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const member = interaction.guild ? await resolveMember(interaction) : null;
  const userIsAdmin = member !== null && isAdmin(member);
  const view = new NotificationsMainView(userIsAdmin, userRepository.getLanguage(interaction.user.id));
  await interaction.editReply({ embeds: [view.buildEmbed()], components: view.getComponents() });
}
