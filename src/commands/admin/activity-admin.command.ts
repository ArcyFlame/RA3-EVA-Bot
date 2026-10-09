import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { RA3Bot } from '../../bot';
import { guildRepository } from '../../repositories/guild.repository';
import { denyUnlessAdmin } from '../../utils/permissions';
import { buildActivityAdminView } from './activity-admin.view';

export const data = new SlashCommandBuilder()
  .setName('activity_admin')
  .setDescription('[Admin] Configure activity XP, levels, ranks and roles')
  .setDefaultMemberPermissions(null);

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: 'This command can only be used inside a server.',
      ephemeral: true,
    });
    return;
  }
  const member = await interaction.guild.members
    .fetch({ user: interaction.user.id, force: true })
    .catch(() => null);
  const denial = denyUnlessAdmin(member);
  if (denial) {
    await interaction.reply({ content: denial, ephemeral: true });
    return;
  }
  if (!guildRepository.findByDiscordId(interaction.guild.id))
    guildRepository.upsert(interaction.guild.id, {});
  await interaction.reply({
    ...buildActivityAdminView(interaction.guild, interaction.user.id),
    ephemeral: true,
  });
}
