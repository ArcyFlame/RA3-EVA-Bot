import { ButtonInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { RA3Bot } from '../../bot';
import { clanRepository } from '../../repositories/clan.repository';
import { isAdmin } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';
import { parseCustomIdInt } from '../../utils/parse';

/**
 * Clan manager edit: `clanmgr_edit_{clanId}` opens a modal with the clan's
 * editable fields (description, max members).
 */
export const customIdPrefix = 'clanmgr_edit_';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  if (!interaction.guild) return;

  const member = await resolveMember(interaction);
  if (!member || !isAdmin(member)) {
    await interaction.reply({ content: 'Admins only.', ephemeral: true });
    return;
  }

  const clanId = parseCustomIdInt(interaction.customId, 2);
  if (clanId === null) {
    await interaction.reply({ content: 'Invalid clan.', ephemeral: true });
    return;
  }
  const clan = clanRepository.findById(clanId, interaction.guild.id);
  if (!clan) {
    await interaction.reply({ content: 'Clan no longer exists.', ephemeral: true });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`clanmgr_edit_modal_${clan.id}`)
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
