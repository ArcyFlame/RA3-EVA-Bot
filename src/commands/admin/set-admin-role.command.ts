import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { RA3Bot } from '../../bot';
import { guildRepository } from '../../repositories/guild.repository';
import { denyUnlessAdmin } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';

export const data = new SlashCommandBuilder()
  .setName('set_admin_role')
  .setDescription('Set the admin role for this server')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addRoleOption((option) =>
    option.setName('role').setDescription('The admin role').setRequired(true),
  );

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Server only.', ephemeral: true });
    return;
  }
  const member = await resolveMember(interaction);
  const denial = denyUnlessAdmin(member);
  if (denial) {
    await interaction.reply({ content: denial, ephemeral: true });
    return;
  }

  const role = interaction.options.getRole('role', true);
  guildRepository.upsert(interaction.guild.id, { adminRoleId: role.id });
  // Echo the role name, not the mention, to avoid pinging every holder.
  await interaction.reply({ content: `✅ Admin role set to **${role.name}**.`, ephemeral: true });
}
