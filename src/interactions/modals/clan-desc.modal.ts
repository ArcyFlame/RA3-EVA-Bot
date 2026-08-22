import { ModalSubmitInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { clanRepository } from '../../repositories/clan.repository';
import { parseCustomIdInt } from '../../utils/parse';
import { sanitizeInput } from '../../utils/sanitize';

export const customIdPrefix = 'clan_desc_modal_';

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
  const newDesc = sanitizeInput(interaction.fields.getTextInputValue('desc').trim(), 500) || null;
  clanRepository.updateDescription(clanId, newDesc);
  await interaction.reply({ content: '✅ Description updated.', ephemeral: true });
}
