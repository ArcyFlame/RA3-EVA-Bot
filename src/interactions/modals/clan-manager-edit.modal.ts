import { ModalSubmitInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { clanRepository } from '../../repositories/clan.repository';
import { sanitizeInput } from '../../utils/sanitize';
import { parseCustomIdInt } from '../../utils/parse';
import { audit } from '../../utils/logger';
import { requireAdminInteraction } from '../../utils/admin-interaction';
import { isOwner } from '../../utils/permissions';

/** Clan manager edit modal: `clanmgr_edit_modal_{clanId}`. */
export const customIdPrefix = 'clanmgr_edit_modal_';

export async function execute(_bot: RA3Bot, interaction: ModalSubmitInteraction) {
  if (!interaction.guild) return;
  if (!(await requireAdminInteraction(interaction))) return;
  const binding = /^clanmgr_edit_modal_\d+_(\d{17,20})_(\d{17,20})$/.exec(interaction.customId);
  if (!binding || binding[1] !== interaction.guild.id || binding[2] !== interaction.user.id) {
    await interaction.reply({
      content: 'This editor is outdated or belongs to another user. Open /clan manager again.',
      ephemeral: true,
    });
    return;
  }

  const clanId = parseCustomIdInt(interaction.customId, 3);
  if (clanId === null) {
    await interaction.reply({ content: 'Invalid clan.', ephemeral: true });
    return;
  }
  const clan =
    clanRepository.findById(clanId, interaction.guild.id) ??
    (isOwner(interaction.user.id) ? clanRepository.findUnassignedById(clanId) : undefined);
  if (!clan) {
    await interaction.reply({ content: 'Clan no longer exists.', ephemeral: true });
    return;
  }

  const description = interaction.fields.getTextInputValue('description').trim();
  if (clan.guildId !== interaction.guild.id && !isOwner(interaction.user.id)) {
    await interaction.reply({
      content: 'Only the bot owner can edit an unassigned legacy clan.',
      ephemeral: true,
    });
    return;
  }

  const maxRaw = interaction.fields.getTextInputValue('maxMembers').trim();
  let max: number | undefined;
  if (maxRaw) {
    max = Number(maxRaw);
    if (!Number.isInteger(max) || max < 2 || max > 100) {
      await interaction.reply({
        content: 'Max members must be a whole number between 2 and 100.',
        ephemeral: true,
      });
      return;
    }
  }
  clanRepository.updateDetails(
    clanId,
    description ? sanitizeInput(description, 500) : undefined,
    max,
  );

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
