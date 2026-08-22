import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { clanRepository } from '../../repositories/clan.repository';
import { guildRepository } from '../../repositories/guild.repository';

export const data = new SlashCommandBuilder()
  .setName('clan_leave')
  .setDescription('Leave your current clan');

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ This command can only be used inside a server.',
      ephemeral: true,
    });
    return;
  }

  const guildData = guildRepository.findByDiscordId(interaction.guild.id);
  if (guildData?.clansEnabled === 0) {
    await interaction.reply({
      content: '❌ Clan system is disabled on this server.',
      ephemeral: true,
    });
    return;
  }

  const userClan = clanRepository.findClanOfUser(interaction.user.id, interaction.guild.id);
  if (!userClan) {
    await interaction.reply({ content: '❌ You are not in any clan.', ephemeral: true });
    return;
  }
  if (userClan.ownerId === interaction.user.id) {
    await interaction.reply({
      content: '❌ Clan leaders cannot leave. Transfer leadership or delete the clan.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  clanRepository.removeMember(userClan.id, interaction.user.id);
  if (userClan.roleId) {
    const role =
      interaction.guild.roles.cache.get(userClan.roleId) ??
      (await interaction.guild.roles.fetch(userClan.roleId).catch(() => null));
    const member =
      interaction.guild.members.cache.get(interaction.user.id) ??
      (await interaction.guild.members.fetch(interaction.user.id).catch(() => null));
    if (role && member) {
      await member.roles.remove(role).catch(() => {
        /* role removal failure must not fail the leave */
      });
    }
  }
  await interaction.editReply({ content: '✅ You have left the clan.' });
}
