import { ButtonInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { newsRepository } from '../../repositories/news.repository';
import { renderNewsPage } from '../../commands/misc/news.command';
import { parseIntSafe } from '../../utils/parse';
import { getGameContext } from '../../utils/game-context';

/**
 * /news navigation: `newspg_{prev|next}_{itemId}`. Wrap-around in both
 * directions; the list is re-read from the database on every click.
 */
export const customIdPrefix = 'newspg_';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  const parts = interaction.customId.split('_'); // ['newspg', action, id]
  const action = parts[1];
  const itemId = parseIntSafe(parts[2]);
  if (!itemId || (action !== 'prev' && action !== 'next')) {
    await interaction.reply({ content: 'Invalid button.', ephemeral: true });
    return;
  }

  await interaction.deferUpdate();
  const items = newsRepository.getLatest(20, getGameContext(interaction.guildId).game);
  const index = items.findIndex((i) => i.id === itemId);
  if (index === -1) {
    await interaction.editReply({ content: 'This news item is no longer available.' });
    return;
  }
  const count = items.length;
  const nextIndex = action === 'prev' ? (index - 1 + count) % count : (index + 1) % count;
  await interaction.editReply(renderNewsPage(items[nextIndex], count, nextIndex));
}
