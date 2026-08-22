import { ModalSubmitInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { buildOrderRepository } from '../../repositories/build-order.repository';
import { renderBuildPanel } from '../../commands/build/build-manage.utils';
import { sanitizeInput } from '../../utils/sanitize';
import { parseIntSafe } from '../../utils/parse';

/** Build edit modal: `buildmg_edit_modal_{buildId}` (owner enforced). */
export const customIdPrefix = 'buildmg_edit_modal_';

export async function execute(_bot: RA3Bot, interaction: ModalSubmitInteraction) {
  const buildId = parseIntSafe(interaction.customId.split('_')[3]);
  if (!buildId) {
    await interaction.reply({ content: 'Invalid build.', ephemeral: true });
    return;
  }
  const build = buildOrderRepository.getBuildById(buildId);
  if (!build) {
    await interaction.reply({ content: 'This build no longer exists.', ephemeral: true });
    return;
  }
  if (build.userId !== interaction.user.id) {
    await interaction.reply({ content: 'Only the author can edit this build.', ephemeral: true });
    return;
  }

  const name = sanitizeInput(interaction.fields.getTextInputValue('name').trim(), 50);
  const content = sanitizeInput(interaction.fields.getTextInputValue('content').trim(), 1900);
  if (!name || !content) {
    await interaction.reply({ content: 'Name and content are required.', ephemeral: true });
    return;
  }

  buildOrderRepository.updateBuild(build.id, build.userId, content, name);
  const updated = buildOrderRepository.getBuildById(build.id)!;
  await interaction.reply({ ...renderBuildPanel(updated), ephemeral: true });
}
