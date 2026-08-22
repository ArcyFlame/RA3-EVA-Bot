import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { tournamentRepository } from '../../repositories/tournament.repository';
import {
  isTournamentRelevant,
  parsePortalDate,
} from '../../services/tournament-scanner.service';
import { truncateSentences } from '../../utils/text';

/**
 * Shared renderer for the interactive tournament browser used by /events,
 * the tournament scanner announcements and the eventpg_* button handlers.
 * Navigation is stateless: the current event id is encoded in the customId,
 * so buttons keep working on any message (channel or ephemeral).
 */

/** Sorted announcement list (newest first), RA3-relevant only. */
export function getSortedAnnouncements() {
  return tournamentRepository
    .getAnnouncements()
    .filter((a) => isTournamentRelevant(a.title))
    .sort((a, b) => {
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
  const date = parsePortalDate(startDate ?? '');
  if (date === null) return false;
  return date + 26 * 60 * 60 * 1000 < Date.now();
}

/** Renders the event embed shared by /events pages and channel cards. */
function renderEventEmbed(
  eventId: number,
  announcements = getSortedAnnouncements(),
): { embed: EmbedBuilder; index: number; signUpUrl: string | undefined; isActive: boolean } | null {
  const index = announcements.findIndex((a) => a.id === eventId);
  if (index === -1) return null;
  const a = announcements[index];

  // Full detail (format / prize / map pool / links) comes from the event record.
  const detail = tournamentRepository.getEventDetail(a.id);
  const signUpUrl = a.signUpUrl ?? detail?.registrationUrl ?? undefined;
  const isActive = !!signUpUrl && !isEventEnded(a.startDate);

  // Short description: full sentences only, never cut mid-word.
  const shortDesc = truncateSentences(a.description || 'A Red Alert 3 tournament announcement.', 220);

  const embed = new EmbedBuilder()
    .setTitle(`🏆 ${a.title}`)
    .setDescription(shortDesc)
    .setURL(a.eventUrl)
    .setColor(isActive ? 0x57f287 : 0xed4245);
  if (a.startDate) embed.addFields({ name: '📅 Date', value: a.startDate, inline: true });
  embed.addFields({
    name: 'Status',
    value: isActive ? '🟢 Open for sign-ups' : '🔴 Ended',
    inline: true,
  });
  if (detail?.format)
    embed.addFields({ name: '⚔️ Format', value: detail.format.slice(0, 100), inline: true });
  // Prize renders for real amounts (currency marker) or a named sponsor.
  if (
    detail?.prizePool &&
    (/\d/.test(detail.prizePool) && /[$€£]|USD/i.test(detail.prizePool) ||
      /^sponsored by/i.test(detail.prizePool.trim()))
  ) {
    embed.addFields({ name: '🎁 Prize', value: detail.prizePool.slice(0, 100), inline: true });
  }
  if (detail?.maps && detail.maps.length >= 3) {
    embed.addFields({
      name: '🗺️ Map Pool',
      value: detail.maps
        .split(/,\s*/)
        .filter(Boolean)
        .slice(0, 12)
        .map((m) => `• ${m}`)
        .join('\n')
        .slice(0, 1024),
      inline: false,
    });
  }
  embed.setFooter({ text: `RA3 Esports • GameReplays.org • ${index + 1}/${announcements.length}` });
  return { embed, index, signUpUrl, isActive };
}

/** The action button every event view shares (Sign Up while open, Results after). */
function actionButton(
  eventId: number,
  signUpUrl: string | undefined,
  isActive: boolean,
): ButtonBuilder {
  if (isActive && signUpUrl) {
    return new ButtonBuilder().setLabel('Sign Up').setStyle(ButtonStyle.Link).setURL(signUpUrl);
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
    actionButton(eventId, rendered.signUpUrl, rendered.isActive),
  );
  return { embeds: [rendered.embed], components: [row] };
}

/** Renders one event page (embed + nav/sign-up/results buttons for /events). */
export function renderEventPage(
  eventId: number,
  announcements = getSortedAnnouncements(),
): { embeds: [EmbedBuilder]; components: [ActionRowBuilder<ButtonBuilder>] } | null {
  const rendered = renderEventEmbed(eventId, announcements);
  if (!rendered) return null;

  const row = new ActionRowBuilder<ButtonBuilder>();
  row.addComponents(actionButton(eventId, rendered.signUpUrl, rendered.isActive));
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
