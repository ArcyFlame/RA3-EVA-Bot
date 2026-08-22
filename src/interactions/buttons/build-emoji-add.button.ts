import { ButtonInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { buildOrderRepository } from '../../repositories/build-order.repository';
import { renderEmojiPicker } from '../../commands/build/build-manage.utils';
import { UNIT_EMOJIS } from '../../utils/unit-emojis';
import { sanitizeInput } from '../../utils/sanitize';
import { parseIntSafe } from '../../utils/parse';

/**
 * Emoji insert: `buildemoji_add_{buildId}_{key}` - appends the emoji code to
 * the build content and re-renders the picker (owner only).
 */
export const customIdPrefix = 'buildemoji_add_';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  const custom = interaction.customId.slice('buildemoji_add_'.length);
  const sep = custom.indexOf('_');
  if (sep === -1) {
    await interaction.reply({ content: 'Invalid button.', ephemeral: true });
    return;
  }
  const buildId = parseIntSafe(custom.slice(0, sep));
  const key = custom.slice(sep + 1);
  const emoji = UNIT_EMOJIS[key];
  if (!buildId || !emoji) {
    await interaction.reply({ content: 'Unknown emoji.', ephemeral: true });
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

  // Append the raw emoji code so build_view renders it in any server with
  // the emoji uploaded.
  const newContent = sanitizeInput(`${build.content} ${emoji}`, 1900);
  buildOrderRepository.updateBuild(build.id, build.userId, newContent);
  await interaction.update(renderEmojiPicker({ ...build, content: newContent }, 0));
}
