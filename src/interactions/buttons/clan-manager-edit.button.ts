import {
  ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { clanRepository } from '../../repositories/clan.repository';
import { isOwner } from '../../utils/permissions';
import { requireAdminInteraction } from '../../utils/admin-interaction';
import { parseCustomIdInt } from '../../utils/parse';

/**
 * Clan manager edit: `clanmgr_edit_{clanId}` opens a modal with the clan's
 * editable fields (description, max members).
 */
export const customIdPrefix = 'clanmgr_edit_';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  if (!interaction.guild) return;

  if (!(await requireAdminInteraction(interaction))) return;

  const clanId = parseCustomIdInt(interaction.customId, 2);
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

  if (clan.guildId !== interaction.guild.id && !isOwner(interaction.user.id)) {
    await interaction.reply({
      content: 'Only the bot owner can edit an unassigned legacy clan.',
      ephemeral: true,
    });
    return;
  }
  const modal = new ModalBuilder()
    .setCustomId(`clanmgr_edit_modal_${clan.id}_${interaction.guild.id}_${interaction.user.id}`)
    .setTitle(`Edit ${clan.tag}`.slice(0, 45));

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('description')
        .setLabel('Description')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(500)
        .setValue(clan.description?.slice(0, 500) ?? ''),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('maxMembers')
        .setLabel('Max members (2-100)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(3)
        .setValue(String(clan.maxMembers)),
    ),
  );
  await interaction.showModal(modal);
}
