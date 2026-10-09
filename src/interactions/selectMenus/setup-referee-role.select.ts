import { RoleSelectMenuInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { guildRepository } from '../../repositories/guild.repository';
import { requireAdminInteraction } from '../../utils/admin-interaction';

export const customId = 'setup_referee_role_select';

export async function execute(_bot: RA3Bot, interaction: RoleSelectMenuInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Server only.', ephemeral: true });
    return;
  }
  if (!(await requireAdminInteraction(interaction))) return;
  const role = await interaction.guild.roles.fetch(interaction.values[0]).catch(() => null);
  if (!role || role.id === interaction.guild.id || role.managed) {
    await interaction.reply({
      content: 'Choose an ordinary server role, not @everyone or a managed role.',
      ephemeral: true,
    });
    return;
  }
  guildRepository.upsert(interaction.guild.id, { refereeRoleId: role.id });
  await interaction.reply({
    content: `✅ Referee role set to ${role}. Check-in summaries can ping it via /checkin.`,
    ephemeral: true,
  });
}
