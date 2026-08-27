import { ButtonInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { fetchResultsList, renderResultsPage } from '../../commands/tournaments/results.utils';
import { parseIntSafe } from '../../utils/parse';
import { logger } from '../../utils/logger';
import { guildRepository } from '../../repositories/guild.repository';
import { resolveMember } from '../../utils/members';
import { isTournamentStaff } from '../../utils/permissions';

/**
 * /results navigation: `resultspg_{prev|next}_{entryId}`. Wrap-around in both
 * directions; the list (Challonge or forum threads) is re-fetched on click.
 */
export const customIdPrefix = 'resultspg_';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  const parts = interaction.customId.split('_'); // ['resultspg', action, id]
  const action = parts[1];
  const entryId = parseIntSafe(parts[2]);
  if (!entryId || (action !== 'prev' && action !== 'next')) {
    await interaction.reply({ content: 'Invalid button.', ephemeral: true });
    return;
  }

  await interaction.deferUpdate();
  try {
    const game = interaction.guildId
      ? (guildRepository.findByDiscordId(interaction.guildId)?.game ?? 'ra3')
      : 'ra3';
    const list = await fetchResultsList(game);
    const index = list.entries.findIndex((e) => e.id === entryId);
    if (index === -1) {
      await interaction.editReply({ content: 'These results are no longer available.' });
      return;
    }
    const count = list.entries.length;
    const nextIndex = action === 'prev' ? (index - 1 + count) % count : (index + 1) % count;
    const member = await resolveMember(interaction);
    const rendered = await renderResultsPage(
      list.entries[nextIndex],
      !!member && isTournamentStaff(member),
    );
    if (rendered) await interaction.editReply(rendered);
  } catch (error) {
    logger.error(`resultspg_${action}: failed:`, error);
    await interaction.editReply({ content: 'Could not load tournament results.' });
  }
}
