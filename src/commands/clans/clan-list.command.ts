import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { RA3Bot } from '../../bot';
import { clanRepository } from '../../repositories/clan.repository';
import { guildRepository } from '../../repositories/guild.repository';

export const data = new SlashCommandBuilder()
  .setName('clans')
  .setDescription('List all clans on this server');

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Server only.', ephemeral: true });
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

  const clans = clanRepository.findApproved(interaction.guild.id).slice(0, 10);
  if (clans.length === 0) {
    await interaction.reply({ content: 'No clans found.', ephemeral: true });
    return;
  }

  // One query for all member counts instead of one per clan.
  const counts = clanRepository.getMemberCounts(clans.map((c) => c.id));

  const embed = new EmbedBuilder().setTitle('🛡️ Clans').setColor(0x5865f2);
  for (const clan of clans) {
    const privacy = clan.isPrivate ? '🔒 Private' : '🌐 Public';
    embed.addFields({
      name: `${clan.name} [${clan.tag}]`,
      value: `${clan.description || 'No description'}\n${privacy} | 👥 ${counts.get(clan.id) ?? 0}/${clan.maxMembers}`,
      inline: false,
    });
  }
  await interaction.reply({ embeds: [embed], ephemeral: true });
}
