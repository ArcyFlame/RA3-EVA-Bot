import { ButtonInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { RA3Bot } from '../../bot';
import { buildOrderRepository } from '../../repositories/build-order.repository';
import { renderBuildPanel, renderEmojiPicker } from '../../commands/build/build-manage.utils';
import { parseIntSafe } from '../../utils/parse';

/**
 * Build management buttons:
 *   buildmg_edit_{buildId}        — open the edit modal (owner only)
 *   buildmg_del_{buildId}         — delete after confirm (owner only)
 *   buildmg_emoji_{buildId}_{page}— emoji picker page
 *   buildmg_back_{buildId}        — back to the build panel
 */
export const customIdPrefix = 'buildmg_';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  const parts = interaction.customId.split('_'); // ['buildmg', action, id, ...]
  const action = parts[1];
  const buildId = parseIntSafe(parts[2]);
  if (!buildId || !['edit', 'del', 'emoji', 'back'].includes(action)) {
    await interaction.reply({ content: 'Invalid button.', ephemeral: true });
    return;
  }

  const build = buildOrderRepository.getBuildById(buildId);
  if (!build) {
    await interaction.reply({ content: 'This build no longer exists.', ephemeral: true });
    return;
  }

  if (action === 'emoji') {
    const page = Number.parseInt(parts[3] ?? '0', 10) || 0;
    await interaction.update(renderEmojiPicker(build, page));
    return;
  }
  if (action === 'back') {
    await interaction.update(renderBuildPanel(build));
    return;
  }

  // edit / del are owner-only.
  if (build.userId !== interaction.user.id) {
    await interaction.reply({ content: 'Only the author can manage this build.', ephemeral: true });
    return;
  }

  if (action === 'del') {
    buildOrderRepository.deleteOrder(build.userId, build.name);
    await interaction.update({ content: `🗑️ Build **${build.name}** deleted.`, embeds: [], components: [] });
    return;
  }

  // edit: modal prefilled with the current content.
  const modal = new ModalBuilder()
    .setCustomId(`buildmg_edit_modal_${build.id}`)
    .setTitle(`Edit ${build.name}`.slice(0, 45));
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('name')
        .setLabel('Build name')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(50)
        .setValue(build.name.slice(0, 50)),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('content')
        .setLabel('Build order')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1900)
        .setValue(build.content.slice(0, 1900)),
    ),
  );
  await interaction.showModal(modal);
}
