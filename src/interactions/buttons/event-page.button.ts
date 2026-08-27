import {
  ButtonInteraction,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { tournamentRepository } from '../../repositories/tournament.repository';
import { getSortedAnnouncements, renderEventPage } from '../../commands/tournaments/events.utils';
import { renderResultsPage, matchesGuildGame } from '../../commands/tournaments/results.utils';
import {
  editionsCompatible,
  forumScanner,
  tournamentNamesMatch,
} from '../../services/forum-scanner.service';
import { challongeService } from '../../services/challonge.service';
import { parseIntSafe } from '../../utils/parse';
import { logger } from '../../utils/logger';
import { guildRepository } from '../../repositories/guild.repository';
import { GameId } from '../../config/games';
import { resolveMember } from '../../utils/members';
import { isTournamentStaff } from '../../utils/permissions';

/**
 * Stateless event-browser actions: `eventpg_{prev|next|results|refresh|edit}_{eventId}`.
 * Works on both scanner channel announcements and /events ephemeral replies —
 * the event id in the customId identifies the current page.
 */
export const customIdPrefix = 'eventpg_';

function modalInput(
  id: string,
  label: string,
  style: TextInputStyle,
  maxLength: number,
  value: string | null | undefined,
  placeholder: string,
): ActionRowBuilder<TextInputBuilder> {
  const input = new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(style)
    .setMaxLength(maxLength)
    .setRequired(false)
    .setPlaceholder(placeholder);
  if (value?.trim()) input.setValue(value.trim().slice(0, maxLength));
  return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
}

/**
 * Finds the Challonge bracket for an event. The portal often carries a twin
 * row ("Rise of the Patch, Bracket Results and Replays") that the forum topic
 * originally paired with — a sibling event sharing the base name may hold
 * the bracket link even when this event's own row has none.
 */
function resolveChallongeUrl(eventId: number, title: string, game: GameId): string | null {
  const brackets = tournamentRepository.getBrackets(eventId);
  const validBracket =
    brackets.find(
      (bracket) =>
        (!bracket.bracketName || editionsCompatible(bracket.bracketName, title)) &&
        bracket.isPrimary,
    ) ??
    brackets.find(
      (bracket) => !bracket.bracketName || editionsCompatible(bracket.bracketName, title),
    );
  if (validBracket) return validBracket.challongeUrl;

  const own = tournamentRepository.getEventDetail(eventId)?.challongeUrl;
  // A known bracket row with a conflicting edition invalidates the legacy
  // event-level URL as well (for example FTW 90 pointing at FTW #88).
  if (own && !brackets.some((bracket) => bracket.challongeUrl === own)) return own;
  const sibling = tournamentRepository
    .getEventsWithChallonge(game)
    .find(
      (e) =>
        e.id !== eventId && matchesGuildGame(e.title, game) && tournamentNamesMatch(e.title, title),
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
    (action !== 'prev' &&
      action !== 'next' &&
      action !== 'results' &&
      action !== 'refresh' &&
      action !== 'edit')
  ) {
    await interaction.reply({ content: 'Invalid button.', ephemeral: true });
    return;
  }

  const guildGame = interaction.guildId
    ? (guildRepository.findByDiscordId(interaction.guildId)?.game ?? 'ra3')
    : (tournamentRepository.getEventDetail(eventId)?.game ?? 'ra3');
  const announcements = getSortedAnnouncements(guildGame);
  const index = announcements.findIndex((a) => a.id === eventId);
  if (index === -1) {
    await interaction.reply({ content: 'This event is no longer available.', ephemeral: true });
    return;
  }
  const member = await resolveMember(interaction);
  const tournamentStaff = !!member && isTournamentStaff(member);

  try {
    if (action === 'edit') {
      if (!tournamentStaff || !interaction.guildId) {
        await interaction.reply({ content: 'Tournament staff only.', ephemeral: true });
        return;
      }
      const detail = tournamentRepository.getEventDetail(eventId);
      if (!detail || detail.game !== guildGame) {
        await interaction.reply({ content: 'This event is not available here.', ephemeral: true });
        return;
      }
      const modal = new ModalBuilder()
        .setCustomId(`tournament_edit_modal_${eventId}`)
        .setTitle('Edit Tournament Details')
        .addComponents(
          modalInput(
            'date',
            'Date',
            TextInputStyle.Short,
            100,
            detail.startDate,
            '14 Mar 2026, 14:00 GMT',
          ),
          modalInput(
            'status',
            'Status',
            TextInputStyle.Short,
            30,
            detail.status === 'unknown' ? undefined : detail.status,
            'registration, checkin, in progress, ended',
          ),
          modalInput(
            'prize',
            'Prize',
            TextInputStyle.Short,
            100,
            detail.prizePool,
            '250$ - sponsored by ...',
          ),
          modalInput(
            'format',
            'Format',
            TextInputStyle.Short,
            100,
            detail.format,
            '2v2 - Single Elimination',
          ),
          modalInput(
            'maps',
            'Map Pool',
            TextInputStyle.Paragraph,
            1000,
            detail.maps,
            'Comma-separated map names',
          ),
        );
      await interaction.showModal(modal);
      return;
    }

    if (action === 'results') {
      await interaction.deferReply({ ephemeral: true });
      const current = announcements[index];
      const detail = tournamentRepository.getEventDetail(current.id);
      // Same view as /results: the event's own bracket, or the sibling
      // event's bracket when the forum topic paired with the twin row.
      const challongeUrl = resolveChallongeUrl(current.id, current.title, guildGame);
      if (challongeUrl) {
        const ref = challongeService.parseTournamentRef(challongeUrl);
        const rendered = ref
          ? await renderResultsPage(
              {
                id: current.id,
                kind: 'challonge',
                title: current.title,
                url: challongeService.bracketUrl(ref),
                challongeId: ref,
                eventId: current.id,
                forumUrl: detail?.topicUrl ?? undefined,
                resultsUrl: detail?.resultUrl ?? undefined,
                imageUrl: detail?.resultImageUrl ?? undefined,
              },
              tournamentStaff,
            ).catch((error) => {
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
      if (detail?.topicUrl) {
        const rendered = await renderResultsPage(
          {
            id: current.id,
            kind: 'forum',
            title: current.title,
            url: detail.resultUrl ?? detail.topicUrl,
            eventId: current.id,
            forumUrl: detail.topicUrl,
            resultsUrl: detail.resultUrl ?? undefined,
            imageUrl: detail.resultImageUrl ?? undefined,
          },
          tournamentStaff,
        );
        if (rendered) {
          await interaction.editReply(rendered);
          return;
        }
      }

      await interaction.editReply({
        content:
          'No results available for this tournament yet. Run `/tournaments_scan` to discover brackets.',
      });
      return;
    }

    if (action === 'refresh') {
      await interaction.deferUpdate();
      // Re-scan the registration topic for new sign-ups, then re-render.
      const added = await forumScanner.refreshRegistrations(eventId);
      const rendered = renderEventPage(eventId, announcements, tournamentStaff);
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
    const nextIndex = action === 'prev' ? (index - 1 + count) % count : (index + 1) % count;
    const target = announcements[nextIndex];
    const rendered = renderEventPage(target.id, announcements, tournamentStaff);
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
