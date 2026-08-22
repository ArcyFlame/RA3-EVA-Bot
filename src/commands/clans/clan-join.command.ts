import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { clanRepository } from '../../repositories/clan.repository';
import { guildRepository } from '../../repositories/guild.repository';
import { validateClanTag } from '../../utils/sanitize';

export const data = new SlashCommandBuilder()
  .setName('clan_join')
  .setDescription('Request to join a clan')
  .addStringOption((option) => option.setName('tag').setDescription('Clan tag').setRequired(true));

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

  const tag = interaction.options.getString('tag', true).trim().toUpperCase();
  if (!validateClanTag(tag)) {
    await interaction.reply({
      content: '❌ Invalid clan tag format (1–6 alphanumeric characters).',
      ephemeral: true,
    });
    return;
  }

  const clan = clanRepository.findByTag(tag, interaction.guild.id);
  if (!clan) {
    await interaction.reply({ content: '❌ Clan not found.', ephemeral: true });
    return;
  }
  if (!clan.approved) {
    await interaction.reply({
      content: '❌ That clan is still pending approval.',
      ephemeral: true,
    });
    return;
  }

  if (clanRepository.findClanOfUser(interaction.user.id, interaction.guild.id)) {
    await interaction.reply({
      content: '❌ You are already in a clan. Leave it first.',
      ephemeral: true,
    });
    return;
  }
  if (clanRepository.hasPendingRequest(clan.id, interaction.user.id)) {
    await interaction.reply({
      content: '❌ You already have a pending request for this clan.',
      ephemeral: true,
    });
    return;
  }
  if (clanRepository.getMemberCount(clan.id) >= clan.maxMembers) {
    await interaction.reply({ content: '❌ That clan is full.', ephemeral: true });
    return;
  }

  if (clan.isPrivate) {
    const modal = new ModalBuilder()
      .setCustomId(`clan_join_modal_${clan.id}`)
      .setTitle(`Join ${clan.name}`.slice(0, 45));
    const messageInput = new TextInputBuilder()
      .setCustomId('message')
      .setLabel('Message to leader (optional)')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(500);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(messageInput));
    await interaction.showModal(modal);
    return;
  }

  // Defer before the (slow) role-grant API call below.
  await interaction.deferReply({ ephemeral: true });

  clanRepository.addMember(clan.id, interaction.user.id);
  if (clan.roleId) {
    const role =
      interaction.guild.roles.cache.get(clan.roleId) ??
      (await interaction.guild.roles.fetch(clan.roleId).catch(() => null));
    const member =
      interaction.guild.members.cache.get(interaction.user.id) ??
      (await interaction.guild.members.fetch(interaction.user.id).catch(() => null));
    if (role && member) {
      await member.roles.add(role).catch(() => {
        /* role grant failure must not fail the join */
      });
    }
  }
  await interaction.editReply({ content: `✅ You joined **${clan.name}**!` });
}
