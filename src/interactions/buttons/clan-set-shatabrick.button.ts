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

export const customIdPrefix = 'clan_set_shatabrick_';

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
    .setCustomId(`clan_shatabrick_modal_${clanId}`)
    .setTitle('Set Shatabrick Clan ID');
  const input = new TextInputBuilder()
    .setCustomId('shatabrick_id')
    .setLabel('Shatabrick Clan ID')
    .setStyle(TextInputStyle.Short)
    .setValue(clan.shatabrickClanId || '')
    .setRequired(false)
    .setMaxLength(50);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  await interaction.showModal(modal);
}
