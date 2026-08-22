import { ModalSubmitInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { RA3Bot } from '../../bot';
import { clanRepository } from '../../repositories/clan.repository';
import { guildRepository } from '../../repositories/guild.repository';
import { validateClanName, validateClanTag, sanitizeInput } from '../../utils/sanitize';
import { logger } from '../../utils/logger';

export const customId = 'clan_create_modal';

export async function execute(_bot: RA3Bot, interaction: ModalSubmitInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Server only.', ephemeral: true });
    return;
  }

  const name = interaction.fields.getTextInputValue('name').trim();
  const tag = interaction.fields.getTextInputValue('tag').trim().toUpperCase();
  const description =
    sanitizeInput(interaction.fields.getTextInputValue('description').trim(), 500) || undefined;

  if (!validateClanName(name)) {
    await interaction.reply({
      content: '❌ Invalid clan name (2–50 alphanumeric characters, spaces, dashes, underscores).',
      ephemeral: true,
    });
    return;
  }
  if (!validateClanTag(tag)) {
    await interaction.reply({
      content: '❌ Invalid clan tag (1–6 alphanumeric characters).',
      ephemeral: true,
    });
    return;
  }

  if (
    clanRepository.findByOwner(interaction.user.id, interaction.guild.id) ||
    clanRepository.findClanOfUser(interaction.user.id, interaction.guild.id)
  ) {
    await interaction.reply({ content: '❌ You are already in a clan.', ephemeral: true });
    return;
  }
  if (clanRepository.findByTag(tag, interaction.guild.id)) {
    await interaction.reply({ content: '❌ Clan tag already taken.', ephemeral: true });
    return;
  }
  if (clanRepository.findByName(name, interaction.guild.id)) {
    await interaction.reply({ content: '❌ Clan name already taken.', ephemeral: true });
    return;
  }

  let clanId: number;
  try {
    clanId = clanRepository.create({
      name,
      tag,
      ownerId: interaction.user.id,
      guildId: interaction.guild.id,
      approved: 0,
      maxMembers: 50,
      isPrivate: 0,
      description,
    });
  } catch (error) {
    // UNIQUE constraint on name/tag — a concurrent submission won the race.
    logger.warn('clan_create: duplicate name/tag:', error);
    await interaction.reply({ content: '❌ Clan name or tag already taken.', ephemeral: true });
    return;
  }
  // The owner is a member of their own clan — keeps findClanOfUser accurate.
  clanRepository.addMember(clanId, interaction.user.id);

  await interaction.deferReply();

  // One approval request per submission: re-check the clan is still pending
  // (a stale retry of this modal must not DM admins twice) and dedupe the
  // recipient list by user id.
  const fresh = clanRepository.findById(clanId, interaction.guild.id);
  if (!fresh || fresh.approved !== 0) {
    await interaction.editReply({
      content: `Clan **${name}** submitted for approval.`,
    });
    return;
  }

  const guildData = guildRepository.findByDiscordId(interaction.guild.id);
  const adminRoleId = guildData?.adminRoleId;
  if (adminRoleId) {
    const role = interaction.guild.roles.cache.get(adminRoleId);
    if (role) {
      // Approval embed with inline buttons; the guild id is encoded in the
      // customId so the buttons work when clicked from these DMs.
      const embed = new EmbedBuilder()
        .setTitle('🛡️ Clan Approval Requested')
        .setDescription(
          `**${name}** [${tag}] created by <@${interaction.user.id}> needs approval.\n` +
            (description ? `> ${description}` : ''),
        )
        .setColor(0xffa500)
        .setFooter({ text: `Server: ${interaction.guild.name}` });
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`approve_clan_${clanId}_${interaction.guild.id}`)
          .setLabel('✅ Approve')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`reject_clan_${clanId}_${interaction.guild.id}`)
          .setLabel('❌ Reject')
          .setStyle(ButtonStyle.Danger),
      );
      const seen = new Set<string>();
      const members = [...role.members.values()]
        .filter((m) => {
          if (seen.has(m.id)) return false;
          seen.add(m.id);
          return true;
        })
        .slice(0, 50);
      await Promise.allSettled(
        members.map((m) => m.send({ embeds: [embed], components: [row] })),
      );
    }
  }

  await interaction.editReply({ content: `Clan **${name}** submitted for approval.` });
}
