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

export const customIdPrefix = 'clan_edit_max_';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  const clanId = parseCustomIdInt(interaction.customId, 3);
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
    .setCustomId(`clan_max_modal_${clanId}`)
    .setTitle('Set Max Members');
  const input = new TextInputBuilder()
    .setCustomId('max')
    .setLabel('Max Members (1-100)')
    .setStyle(TextInputStyle.Short)
    .setValue(clan.maxMembers.toString())
    .setRequired(true)
    .setMaxLength(3);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  await interaction.showModal(modal);
}
