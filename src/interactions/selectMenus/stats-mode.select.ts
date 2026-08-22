import { StringSelectMenuInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { ra3StatsService } from '../../services/ra3-stats.service';
import { StatsView, STATS_MODES, StatsMode } from '../../commands/stats/stats.view';
import { logger } from '../../utils/logger';

const processing = new Map<string, boolean>();

/**
 * Mode selector on the Top 10 Players page. The chosen mode arrives in the
 * select value; the re-render encodes it into the nav button customIds so
 * navigation stays stateless.
 */
export const customId = 'stats_mode';

export async function execute(_bot: RA3Bot, interaction: StringSelectMenuInteraction) {
  if (!interaction.message) return;
  const messageId = interaction.message.id;
  const mode = STATS_MODES.find((m) => m === interaction.values[0]);
  if (!mode) {
    await interaction.reply({ content: 'Invalid mode.', ephemeral: true });
    return;
  }

  if (processing.get(messageId)) return;
  processing.set(messageId, true);

  try {
    const stats = await ra3StatsService.fetch();
    const view = new StatsView(stats);
    view.setPage(2);
    view.setMode(mode as StatsMode);
    await interaction.deferUpdate();
    await interaction.editReply({ embeds: [view.getEmbed()], components: view.getComponents() });
  } catch (error) {
    logger.error('Stats mode error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction
        .reply({ content: 'Something went wrong switching modes.', ephemeral: true })
        .catch(() => null);
    }
  } finally {
    processing.delete(messageId);
  }
}
