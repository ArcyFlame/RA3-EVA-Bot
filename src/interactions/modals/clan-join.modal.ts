import { ModalSubmitInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { clanRepository } from '../../repositories/clan.repository';
import { parseCustomIdInt } from '../../utils/parse';
import { sanitizeInput } from '../../utils/sanitize';

export const customIdPrefix = 'clan_join_modal_';

export async function execute(_bot: RA3Bot, interaction: ModalSubmitInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Server only.', ephemeral: true });
    return;
  }
  const clanId = parseCustomIdInt(interaction.customId, 3);
  if (clanId === null) {
    await interaction.reply({ content: 'Invalid clan.', ephemeral: true });
    return;
  }
  const clan = clanRepository.findById(clanId);
  if (!clan || !clan.approved) {
    await interaction.reply({ content: 'That clan is not available.', ephemeral: true });
    return;
  }
  if (clanRepository.findClanOfUser(interaction.user.id, interaction.guild.id)) {
    await interaction.reply({ content: '❌ You are already in a clan.', ephemeral: true });
    return;
  }
  if (clanRepository.hasPendingRequest(clanId, interaction.user.id)) {
    await interaction.reply({
      content: '❌ You already have a pending request for this clan.',
      ephemeral: true,
    });
    return;
  }
  if (clanRepository.getMemberCount(clanId) >= clan.maxMembers) {
    await interaction.reply({ content: '❌ That clan is full.', ephemeral: true });
    return;
  }

  const message =
    sanitizeInput(interaction.fields.getTextInputValue('message').trim(), 500) || undefined;
  clanRepository.addJoinRequest(clanId, interaction.user.id, message);
  await interaction.reply({
    content: `✅ Request sent to join **${clan.name}**.`,
    ephemeral: true,
  });
}
