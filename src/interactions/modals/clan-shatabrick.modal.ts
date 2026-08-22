import { ModalSubmitInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { clanRepository } from '../../repositories/clan.repository';
import { parseCustomIdInt } from '../../utils/parse';

export const customIdPrefix = 'clan_shatabrick_modal_';

export async function execute(_bot: RA3Bot, interaction: ModalSubmitInteraction) {
  const clanId = parseCustomIdInt(interaction.customId, 3);
  if (clanId === null) {
    await interaction.reply({ content: 'Invalid clan.', ephemeral: true });
    return;
  }
  const clan = clanRepository.findById(clanId);
  if (!clan || clan.ownerId !== interaction.user.id) {
    await interaction.reply({ content: 'Not authorized.', ephemeral: true });
    return;
  }
  const shatabrickId = interaction.fields.getTextInputValue('shatabrick_id').trim() || null;
  clanRepository.updateShatabrickId(clanId, shatabrickId);
  await interaction.reply({ content: '✅ Shatabrick Clan ID updated.', ephemeral: true });
}
