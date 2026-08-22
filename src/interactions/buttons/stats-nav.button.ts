import { ButtonInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { ra3StatsService } from '../../services/ra3-stats.service';
import { StatsView, STATS_MODES, STATS_PAGES, StatsPage } from '../../commands/stats/stats.view';
import { statsPanelRepository } from '../../repositories/stats-panel.repository';
import { guildRepository } from '../../repositories/guild.repository';
import { generatePieChartBuffer } from '../../utils/charts';
import { logger } from '../../utils/logger';

const processing = new Map<string, boolean>();

/**
 * Stateless stats navigation: `stats_nav_{prev|next|refresh}_{page}_{modeIdx}`.
 *
 * Public panels (created via /stats_panel): the click is answered with a
 * PRIVATE ephemeral reply showing the requested page — the shared panel in the
 * channel always stays on the RA3 Community Live Stats overview.
 *
 * Ephemeral /stats replies: the message is updated in place; the page/mode
 * state lives in the customId, so navigation works without any DB row.
 */
export const customIdPrefix = 'stats_nav_';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  if (!interaction.message) return;
  const messageId = interaction.message.id;
  const parts = interaction.customId.split('_'); // ['stats','nav',action,page,modeIdx]
  const action = parts[2];
  const page = Number(parts[3]);
  const modeIdx = Number(parts[4]);
  if (
    (action !== 'prev' && action !== 'next' && action !== 'refresh') ||
    !Number.isInteger(page) ||
    page < 0 ||
    page >= STATS_PAGES
  ) {
    await interaction.reply({ content: 'Invalid button.', ephemeral: true });
    return;
  }
  const mode = STATS_MODES[modeIdx] ?? '1v1';

  if (processing.get(messageId)) return;
  processing.set(messageId, true);

  const isPublicPanel = !!statsPanelRepository.getByMessageId(messageId);
  // Wrap-around: Previous on page 0 loops to the last page and vice versa.
  const nextPage: StatsPage =
    action === 'next'
      ? ((page + 1) % STATS_PAGES as StatsPage)
      : action === 'prev'
        ? ((page - 1 + STATS_PAGES) % STATS_PAGES as StatsPage)
        : (page as StatsPage);

  try {
    const stats = await ra3StatsService.fetch();
    const view = new StatsView(stats);
    view.setPage(nextPage);
    view.setMode(mode);
    // The faction data is RA3BattleNet's — hide it (and its pie) elsewhere.
    const showRa3b = interaction.guildId
      ? (guildRepository.findByDiscordId(interaction.guildId)?.game ?? 'ra3') === 'ra3'
      : true;
    view.setShowRa3b(showRa3b);
    const payload: any = { embeds: [view.getEmbed()], components: view.getComponents() };

    // The Recent Matches & Factions page carries the faction distribution pie
    // in a separate follow-up message (attachments would render ABOVE the
    // embed inside a single message).
    let pieFiles: Array<{ attachment: Buffer; name: string }> | null = null;
    if (nextPage === 1 && showRa3b) {
      try {
        const pie = await generatePieChartBuffer(stats.faction_distribution);
        pieFiles = [{ attachment: pie, name: 'faction_distribution.png' }];
      } catch (err) {
        logger.warn('Faction pie chart failed:', err);
      }
    }

    if (isPublicPanel) {
      // Private answer for the clicker; the public panel stays on the overview.
      if (interaction.deferred || interaction.replied) return;
      await interaction.deferReply({ ephemeral: true });
      await interaction.editReply({
        ...payload,
        content: '📬 Showing you this page privately - the channel panel stays on Live Stats.',
      });
    } else {
      await interaction.deferUpdate();
      await interaction.editReply(payload);
    }

    if (pieFiles) {
      await interaction.followUp({ files: pieFiles, ephemeral: true });
    }
  } catch (error) {
    logger.error(`Stats nav ${action} error:`, error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction
        .reply({ content: 'Something went wrong loading stats.', ephemeral: true })
        .catch(() => null);
    }
  } finally {
    processing.delete(messageId);
  }
}
