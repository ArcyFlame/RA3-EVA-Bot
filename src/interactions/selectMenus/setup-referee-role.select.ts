import { RoleSelectMenuInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { guildRepository } from '../../repositories/guild.repository';

export const customId = 'setup_referee_role_select';

export async function execute(_bot: RA3Bot, interaction: RoleSelectMenuInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Server only.', ephemeral: true });
    return;
  }
  const role = interaction.roles.first();
  if (!role) {
    await interaction.reply({ content: 'No role selected.', ephemeral: true });
    return;
  }
  guildRepository.upsert(interaction.guild.id, { refereeRoleId: role.id });
  await interaction.reply({
    content: `✅ Referee role set to ${role}. Check-in summaries can ping it via /checkin.`,
    ephemeral: true,
  });
}
