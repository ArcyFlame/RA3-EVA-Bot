import {
  ModalSubmitInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { clanRepository, ClanSubmissionError } from '../../repositories/clan.repository';
import { guildRepository } from '../../repositories/guild.repository';
import { validateClanName, validateClanTag, sanitizeInput } from '../../utils/sanitize';
import { logger } from '../../utils/logger';

export const customId = 'clan_create_modal';
export async function execute(_bot: RA3Bot, interaction: ModalSubmitInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Server only.', ephemeral: true });
    return;
  }
  const settings = guildRepository.findByDiscordId(interaction.guild.id);
  if (settings?.clansEnabled !== 1) {
    await interaction.reply({ content: 'Clans are disabled on this server.', ephemeral: true });
    return;
  }
  const name = interaction.fields.getTextInputValue('name').trim();
  const tag = interaction.fields.getTextInputValue('tag').trim().toUpperCase();
  const description =
    sanitizeInput(interaction.fields.getTextInputValue('description').trim(), 500) || undefined;
  if (!validateClanName(name) || !validateClanTag(tag)) {
    await interaction.reply({
      content: 'Use a clan name of 2-50 characters and an alphanumeric tag of 1-6 characters.',
      ephemeral: true,
    });
    return;
  }
  let clanId: number;
  try {
    clanId = clanRepository.submit({
      name,
      tag,
      description,
      ownerId: interaction.user.id,
      guildId: interaction.guild.id,
      approved: 0,
      maxMembers: 50,
      isPrivate: 0,
    });
  } catch (error) {
    if (!(error instanceof ClanSubmissionError))
      logger.warn('clan_create: submission failed:', error);
    await interaction.reply({
      content:
        error instanceof ClanSubmissionError
          ? error.message
          : 'Could not submit this clan. The name or tag may already be taken.',
      ephemeral: true,
    });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  const channel = settings.clanChannelId
    ? interaction.guild.channels.cache.get(settings.clanChannelId)
    : null;
  if (
    channel?.isTextBased() &&
    'send' in channel &&
    clanRepository.claimApprovalNotification(interaction.guild.id)
  ) {
    const pending = clanRepository.findPending(interaction.guild.id).length;
    const embed = new EmbedBuilder()
      .setTitle('🛡️ Clan Approval Queue')
      .setColor(0xffa500)
      .setDescription(
        `**${name}** [${tag}] submitted by <@${interaction.user.id}>.\n\n${pending} pending request(s). Use /clan approve to review all requests.`,
      );
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`approve_clan_${clanId}_${interaction.guild.id}`)
        .setLabel('Approve')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`reject_clan_${clanId}_${interaction.guild.id}`)
        .setLabel('Reject')
        .setStyle(ButtonStyle.Danger),
    );
    await channel
      .send({ embeds: [embed], components: [row], allowedMentions: { parse: [] } })
      .catch((error) => logger.warn('Clan approval channel could not be notified:', error));
  }
  await interaction.editReply({
    content: `Clan **${name}** submitted for approval. Admins can review it with /clan approve.`,
    allowedMentions: { parse: [] },
  });
}
