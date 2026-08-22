import { ModalSubmitInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { clanRepository } from '../../repositories/clan.repository';
import { parseCustomIdInt, parseIntSafe } from '../../utils/parse';

export const customIdPrefix = 'clan_max_modal_';

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
  // parseIntSafe rejects trailing junk ("50abc") and non-integers.
  const max = parseIntSafe(interaction.fields.getTextInputValue('max').trim());
  if (max === null || max < 1 || max > 100) {
    await interaction.reply({ content: 'Invalid number (1-100).', ephemeral: true });
    return;
  }
  clanRepository.updateMaxMembers(clanId, max);
  await interaction.reply({ content: '✅ Max members updated.', ephemeral: true });
}
