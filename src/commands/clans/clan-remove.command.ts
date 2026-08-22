import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { clanRepository } from '../../repositories/clan.repository';
import { guildRepository } from '../../repositories/guild.repository';

export const data = new SlashCommandBuilder()
  .setName('clan_remove')
  .setDescription('Delete your own clan (leader only)');

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Server only.', ephemeral: true });
    return;
  }

  const guildData = await guildRepository.findByDiscordId(interaction.guild.id);
  if (guildData?.clansEnabled === 0) {
    await interaction.reply({ content: '❌ Clan system is disabled on this server.', ephemeral: true });
    return;
  }

  const clan = clanRepository.findClanOfUser(interaction.user.id, interaction.guild.id);
  if (!clan) {
    await interaction.reply({ content: 'You are not in a clan.', ephemeral: true });
    return;
  }
  if (clan.ownerId !== interaction.user.id) {
    await interaction.reply({
      content: `Only the clan leader can remove **${clan.name}**.`,
      ephemeral: true,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`⚠️ Remove ${clan.name}?`)
    .setDescription(
      `This permanently deletes the clan **${clan.name}** [${clan.tag}], its role and channels.\n` +
        'This cannot be undone.',
    )
    .setColor(0xed4245);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`clan_rm_confirm_${clan.id}_${interaction.guild.id}`)
      .setLabel('🗑️ Delete clan')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('clan_rm_cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
  );
  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}
