import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { clanRepository } from '../../repositories/clan.repository';
import { guildRepository } from '../../repositories/guild.repository';

export const data = new SlashCommandBuilder()
  .setName('clan_manage')
  .setDescription('Manage your clan (leader only)');

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Server only.', ephemeral: true });
    return;
  }

  const guildData = await guildRepository.findByDiscordId(interaction.guild.id);
  if (guildData?.clansEnabled === 0) {
    await interaction.reply({
      content: '❌ Clan system is disabled on this server.',
      ephemeral: true,
    });
    return;
  }

  const clan = clanRepository.findByOwner(interaction.user.id, interaction.guild.id);
  if (!clan) {
    await interaction.reply({
      content: 'You are not the leader of any approved clan.',
      ephemeral: true,
    });
    return;
  }
  const embed = new EmbedBuilder()
    .setTitle(`Manage ${clan.name} [${clan.tag}]`)
    .setDescription('Use the buttons below to edit your clan.')
    .setColor(clan.color || 0x5865f2);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`clan_edit_desc_${clan.id}`)
      .setLabel('Edit Description')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`clan_edit_max_${clan.id}`)
      .setLabel('Max Members')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`clan_edit_color_${clan.id}`)
      .setLabel('Change Color')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`clan_toggle_privacy_${clan.id}`)
      .setLabel('Toggle Privacy')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`clan_transfer_${clan.id}`)
      .setLabel('Transfer Leadership')
      .setStyle(ButtonStyle.Danger),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`clan_invite_${clan.id}`)
      .setLabel('Invite Member')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`clan_kick_${clan.id}`)
      .setLabel('Kick Member')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`clan_view_requests_${clan.id}`)
      .setLabel('View Requests')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`clan_set_shatabrick_${clan.id}`)
      .setLabel('Set Shatabrick')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`clan_delete_${clan.id}`)
      .setLabel('Delete Clan')
      .setStyle(ButtonStyle.Danger),
  );
  await interaction.reply({ embeds: [embed], components: [row, row2], ephemeral: true });
}
