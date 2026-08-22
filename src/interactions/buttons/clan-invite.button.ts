import {
  ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { clanRepository } from '../../repositories/clan.repository';
import { parseCustomIdInt } from '../../utils/parse';

export const customIdPrefix = 'clan_invite_';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Server only.', ephemeral: true }).catch(() => null);
    return;
  }
  const clanId = parseCustomIdInt(interaction.customId, 2);
  if (clanId === null) {
    await interaction.reply({ content: 'Invalid clan.', ephemeral: true });
    return;
  }
  const clan = clanRepository.findById(clanId);
  if (!clan || clan.ownerId !== interaction.user.id) {
    await interaction.reply({ content: 'You are not the leader of this clan.', ephemeral: true });
    return;
  }
  const modal = new ModalBuilder()
    .setCustomId(`clan_invite_modal_${clanId}`)
    .setTitle(`Invite to ${clan.name}`);
  const input = new TextInputBuilder()
    .setCustomId('user_id')
    .setLabel('User ID or Mention')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(50);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  await interaction.showModal(modal);
}
