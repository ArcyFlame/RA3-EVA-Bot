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

export const customIdPrefix = 'clan_edit_color_';

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
    .setCustomId(`clan_color_modal_${clanId}`)
    .setTitle('Change Role Color');
  const input = new TextInputBuilder()
    .setCustomId('color')
    .setLabel('HEX Color (e.g., #FF5500)')
    .setStyle(TextInputStyle.Short)
    .setValue(clan.color ? `#${clan.color.toString(16).padStart(6, '0')}` : '')
    .setRequired(true)
    .setMaxLength(7);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  await interaction.showModal(modal);
}
