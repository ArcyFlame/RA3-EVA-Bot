import { ButtonInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { RA3Bot } from '../../bot';
import { tournamentRepository } from '../../repositories/tournament.repository';
import { getSortedAnnouncements, renderEventPage } from '../../commands/tournaments/events.utils';
import { renderResultsPage, matchesGuildGame } from '../../commands/tournaments/results.utils';
import { baseName, forumScanner } from '../../services/forum-scanner.service';
import { challongeService } from '../../services/challonge.service';
import { parseIntSafe } from '../../utils/parse';
import { logger } from '../../utils/logger';
import { guildRepository } from '../../repositories/guild.repository';

/**
 * Stateless event-browser actions: `eventpg_{prev|next|results|refresh}_{eventId}`.
 * Works on both scanner channel announcements and /events ephemeral replies —
 * the event id in the customId identifies the current page.
 */
export const customIdPrefix = 'eventpg_';

/**
 * Finds the Challonge bracket for an event. The portal often carries a twin
 * row ("Rise of the Patch, Bracket Results and Replays") that the forum topic
 * originally paired with — a sibling event sharing the base name may hold
 * the bracket link even when this event's own row has none.
 */
function resolveChallongeUrl(eventId: number, title: string, game: string): string | null {
  const own = tournamentRepository.getEventDetail(eventId)?.challongeUrl;
  if (own) return own;
  const prefix = baseName(title).slice(0, 12);
  if (!prefix) return null;
  const sibling = tournamentRepository
    .getEventsWithChallonge()
    .find(
      (e) =>
        e.id !== eventId &&
        matchesGuildGame(e.title, game) &&
        (baseName(e.title).startsWith(prefix) || baseName(title).startsWith(baseName(e.title).slice(0, 12))),
    );
  if (sibling) {
    // Self-heal: remember the bracket on the announcement row itself.
    tournamentRepository.setEventChallongeUrl(eventId, sibling.challongeUrl);
    return sibling.challongeUrl;
  }
  return null;
}

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  const parts = interaction.customId.split('_'); // ['eventpg', action, id]
  const action = parts[1];
  const eventId = parseIntSafe(parts[2]);
  if (
    !eventId ||
    (action !== 'prev' && action !== 'next' && action !== 'results' && action !== 'refresh')
  ) {
    await interaction.reply({ content: 'Invalid button.', ephemeral: true });
    return;
  }

  const announcements = getSortedAnnouncements();
  const index = announcements.findIndex((a) => a.id === eventId);
  if (index === -1) {
    await interaction.reply({ content: 'This event is no longer available.', ephemeral: true });
    return;
  }

  try {
    if (action === 'results') {
      await interaction.deferReply({ ephemeral: true });
      const current = announcements[index];
      const guildGame = interaction.guildId
        ? guildRepository.findByDiscordId(interaction.guildId)?.game ?? 'ra3'
        : 'ra3';

      // Same view as /results: the event's own bracket, or the sibling
      // event's bracket when the forum topic paired with the twin row.
      const challongeUrl = resolveChallongeUrl(current.id, current.title, guildGame);
      if (challongeUrl) {
        const ref = challongeService.parseTournamentRef(challongeUrl);
        const rendered = ref
          ? await renderResultsPage({
              id: current.id,
              kind: 'challonge',
              title: current.title,
              url: challongeService.bracketUrl(ref),
              challongeId: ref,
            }).catch((error) => {
              logger.warn('eventpg_results: Challonge fetch failed:', error);
              return null;
            })
          : null;
        if (rendered) {
          await interaction.editReply(rendered);
          return;
        }
      }

      // Fall back to the results forum topic if one was linked.
      const detail = tournamentRepository.getEventDetail(current.id);
      if (detail?.topicUrl) {
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setLabel('Open Results Thread')
            .setStyle(ButtonStyle.Link)
            .setURL(detail.topicUrl),
        );
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle(`📊 ${current.title}`)
              .setURL(detail.topicUrl)
              .setDescription('Brackets, results and replays for this tournament.')
              .setColor(0x5865f2),
          ],
          components: [row],
        });
        return;
      }

      await interaction.editReply({
        content: 'No results available for this tournament yet. Run `/tournaments_scan` to discover brackets.',
      });
      return;
    }

    if (action === 'refresh') {
      await interaction.deferUpdate();
      // Re-scan the registration topic for new sign-ups, then re-render.
      const added = await forumScanner.refreshRegistrations(eventId);
      const rendered = renderEventPage(eventId, announcements);
      if (rendered) {
        await interaction.editReply({
          ...rendered,
          content:
            added > 0
              ? `⟳ Refreshed - ${added} new registration(s) pulled from the forum.`
              : undefined,
        });
      }
      return;
    }

    // Wrap-around: prev on the first event loops to the last, next on the
    // last loops back to the first.
    const count = announcements.length;
    const nextIndex =
      action === 'prev' ? (index - 1 + count) % count : (index + 1) % count;
    const target = announcements[nextIndex];
    const rendered = renderEventPage(target.id, announcements);
    if (!rendered) {
      await interaction.reply({ content: 'Could not render this event.', ephemeral: true });
      return;
    }
    await interaction.update(rendered);
  } catch (error) {
    logger.error(`eventpg_${action}: failed:`, error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction
        .reply({ content: 'Something went wrong browsing events.', ephemeral: true })
        .catch(() => null);
    }
  }
}
