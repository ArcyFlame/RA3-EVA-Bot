import { ModalSubmitInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { buildOrderRepository } from '../../repositories/build-order.repository';
import { sanitizeInput } from '../../utils/sanitize';

const MAX_NAME_LENGTH = 50;
// Embed descriptions cap at 4096 chars; keep stored content well under that so
// build_view can always render it (with room for markdown/mentions).
const MAX_CONTENT_LENGTH = 1900;

export const customId = 'build_create_modal';

export async function execute(_bot: RA3Bot, interaction: ModalSubmitInteraction) {
  const name = sanitizeInput(interaction.fields.getTextInputValue('name').trim(), MAX_NAME_LENGTH);
  const content = sanitizeInput(
    interaction.fields.getTextInputValue('content').trim(),
    MAX_CONTENT_LENGTH,
  );

  if (!name || !content) {
    await interaction.reply({ content: '❌ Name and content are required.', ephemeral: true });
    return;
  }
  if (buildOrderRepository.getOrder(interaction.user.id, name)) {
    await interaction.reply({
      content: '❌ A build order with that name already exists.',
      ephemeral: true,
    });
    return;
  }

  buildOrderRepository.create(interaction.user.id, name, content);
  const created = buildOrderRepository.getOrder(interaction.user.id, name);
  if (created) {
    // Hand the author the management panel (edit / emoji picker / delete).
    const { renderBuildPanel } = await import('../../commands/build/build-manage.utils');
    await interaction.reply({ ...renderBuildPanel(created), ephemeral: true });
    return;
  }
  await interaction.reply({
    content: `Build order **${name}** created by <@${interaction.user.id}>. View it with \`/build_view ${name}\`.`,
    ephemeral: true,
  });
}
