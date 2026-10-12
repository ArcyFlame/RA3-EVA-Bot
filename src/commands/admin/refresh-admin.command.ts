import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { RA3Bot } from '../../bot';
import { requireAdminInteraction } from '../../utils/admin-interaction';
import { refreshView } from './refresh-admin.view';
import { isOwner } from '../../utils/permissions';
export const data = new SlashCommandBuilder()
  .setName('refresh_admin')
  .setDescription('Configure automatic refresh intervals (admin)');
export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  if (!(await requireAdminInteraction(interaction))) return;
  await interaction.reply({
    ...refreshView(interaction.guildId!, interaction.user.id, isOwner(interaction.user.id)),
    ephemeral: true,
  });
}
