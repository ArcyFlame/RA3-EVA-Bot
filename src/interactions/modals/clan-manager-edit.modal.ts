import { ModalSubmitInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { clanRepository } from '../../repositories/clan.repository';
import { sanitizeInput } from '../../utils/sanitize';
import { parseCustomIdInt } from '../../utils/parse';
import { audit } from '../../utils/logger';

/** Clan manager edit modal: `clanmgr_edit_modal_{clanId}`. */
export const customIdPrefix = 'clanmgr_edit_modal_';

export async function execute(_bot: RA3Bot, interaction: ModalSubmitInteraction) {
  if (!interaction.guild) return;

  const clanId = parseCustomIdInt(interaction.customId, 3);
  if (clanId === null) {
    await interaction.reply({ content: 'Invalid clan.', ephemeral: true });
    return;
  }
  const clan = clanRepository.findById(clanId, interaction.guild.id);
  if (!clan) {
    await interaction.reply({ content: 'Clan no longer exists.', ephemeral: true });
    return;
  }

  const description = interaction.fields.getTextInputValue('description').trim();
  if (description) {
    clanRepository.updateDescription(clanId, sanitizeInput(description, 500));
  }

  const maxRaw = interaction.fields.getTextInputValue('maxMembers').trim();
  if (maxRaw) {
    const max = Number(maxRaw);
    if (Number.isInteger(max) && max >= 2 && max <= 100) {
      clanRepository.updateMaxMembers(clanId, max);
    } else {
      await interaction.reply({
        content: 'Max members must be a whole number between 2 and 100.',
        ephemeral: true,
      });
      return;
    }
  }

  audit('clan_manager_edit', {
    clanId,
    guildId: interaction.guild.id,
    userId: interaction.user.id,
  });
  await interaction.reply({
    content: `Clan **${clan.name}** [${clan.tag}] updated.`,
    ephemeral: true,
  });
}
