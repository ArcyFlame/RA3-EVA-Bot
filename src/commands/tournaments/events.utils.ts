import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { tournamentRepository } from '../../repositories/tournament.repository';
import { parsePortalDate } from '../../services/tournament-scanner.service';
import { truncateSentences } from '../../utils/text';
import { resolveTournamentStatus, tournamentStatusLabel } from '../../utils/tournament-status';
import { GameId, GAME_CONFIGS } from '../../config/games';

/**
 * Shared renderer for the interactive tournament browser used by /events,
 * the tournament scanner announcements and the eventpg_* button handlers.
 * Navigation is stateless: the current event id is encoded in the customId,
 * so buttons keep working on any message (channel or ephemeral).
 */

/** Sorted announcement list (newest first) for one configured game. */
export function getSortedAnnouncements(game: GameId = 'ra3') {
  return tournamentRepository.getAnnouncements(game).sort((a, b) => {
    const ta = parsePortalDate(a.startDate ?? '') ?? 0;
    const tb = parsePortalDate(b.startDate ?? '') ?? 0;
    return tb - ta;
  });
}

/**
 * A tournament counts as ended once its start day has fully passed. Without
 * a parseable date we can't tell, so it stays "open" (sign-up link decides).
 */
export function isEventEnded(startDate: string | null | undefined): boolean {
  return resolveTournamentStatus({ startDate }) === 'ended';
}

/** Renders the event embed shared by /events pages and channel cards. */
function renderEventEmbed(
  eventId: number,
  announcements?: ReturnType<typeof getSortedAnnouncements>,
): { embed: EmbedBuilder; index: number; actionUrl: string; isActive: boolean } | null {
  const detail = tournamentRepository.getEventDetail(eventId);
  if (!detail) return null;
  const config = GAME_CONFIGS[detail.game];
  announcements ??= getSortedAnnouncements(detail.game);
  const index = announcements.findIndex((a) => a.id === eventId);
  if (index === -1) return null;
  const a = announcements[index];

  // Full detail (format / prize / map pool / links) comes from the event record.
  const registrationUrl = detail?.registrationUrl ?? a.signUpUrl ?? undefined;
  const status = resolveTournamentStatus({
    storedStatus: detail?.status,
    startDate: a.startDate,
    registrationUrl,
    checkinsUrl: detail?.checkinsUrl,
  });
  const isActive = status !== 'ended';
  const actionUrl =
    registrationUrl ?? detail?.topicUrl ?? a.eventUrl ?? config.tournamentFallbackUrl;

  // Short description: full sentences only, never cut mid-word.
  const shortDesc = truncateSentences(
    a.description || `A ${config.shortLabel} tournament announcement.`,
    220,
  );

  const embed = new EmbedBuilder()
    .setTitle(`🏆 ${a.title}`)
    .setDescription(shortDesc)
    .setURL(a.eventUrl)
    .setColor(isActive ? config.color : 0xed4245)
    .setThumbnail(config.artworkUrl);
  const validPrize =
    detail?.prizePool &&
    ((/\d/.test(detail.prizePool) && /[$€£]|USD/i.test(detail.prizePool)) ||
      /^sponsored by/i.test(detail.prizePool.trim()))
      ? detail.prizePool.slice(0, 100)
      : 'Not announced';
  const mapPool = detail?.maps?.trim()
    ? detail.maps
        .split(/,\s*/)
        .filter(Boolean)
        .slice(0, 12)
        .map((m) => `• ${m}`)
        .join('\n')
        .slice(0, 1024)
    : `[Not published — open the tournament post](${actionUrl})`;

  // Keep the same five facts, in the same order, on every event card. Missing
  // details stay visible instead of making otherwise similar cards jump around.
  embed.addFields(
    { name: '📅 Date', value: a.startDate || 'Not announced', inline: true },
    { name: '🚦 Status', value: tournamentStatusLabel(status), inline: true },
    { name: '🎁 Prize', value: validPrize, inline: true },
    {
      name: '⚔️ Format',
      value: detail?.format?.trim().slice(0, 100) || 'Not announced',
      inline: false,
    },
    {
      name: '🗺️ Map Pool',
      value: mapPool,
      inline: false,
    },
  );
  embed.setFooter({ text: `${config.shortLabel} Esports • ${index + 1}/${announcements.length}` });
  return { embed, index, actionUrl, isActive };
}

/** The action button every event view shares (Sign Up while open, Results after). */
function actionButton(eventId: number, actionUrl: string, isActive: boolean): ButtonBuilder {
  if (isActive) {
    return new ButtonBuilder()
      .setLabel('Join / Register')
      .setStyle(ButtonStyle.Link)
      .setURL(actionUrl);
  }
  return new ButtonBuilder()
    .setCustomId(`eventpg_results_${eventId}`)
    .setLabel('📊 Results')
    .setStyle(ButtonStyle.Primary);
}

/**
 * Channel announcement card: Sign Up / Results button only. Posted messages
 * are read like news — no Previous/Next navigation there (that's what
 * /events is for).
 */
export function renderEventCard(
  eventId: number,
): { embeds: [EmbedBuilder]; components: [ActionRowBuilder<ButtonBuilder>] } | null {
  const rendered = renderEventEmbed(eventId);
  if (!rendered) return null;
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    actionButton(eventId, rendered.actionUrl, rendered.isActive),
  );
  return { embeds: [rendered.embed], components: [row] };
}

/** Renders one event page (embed + nav/sign-up/results buttons for /events). */
export function renderEventPage(
  eventId: number,
  announcements?: ReturnType<typeof getSortedAnnouncements>,
): { embeds: [EmbedBuilder]; components: [ActionRowBuilder<ButtonBuilder>] } | null {
  const rendered = renderEventEmbed(eventId, announcements);
  if (!rendered) return null;

  const row = new ActionRowBuilder<ButtonBuilder>();
  row.addComponents(actionButton(eventId, rendered.actionUrl, rendered.isActive));
  // Wrap-around navigation with Refresh in the middle: prev on the first
  // item loops to the last and vice versa, so every event is reachable.
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`eventpg_prev_${eventId}`)
      .setLabel('◀ Previous')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`eventpg_refresh_${eventId}`)
      .setLabel('⟳ Refresh')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`eventpg_next_${eventId}`)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [rendered.embed], components: [row] };
}
