import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { tournamentRepository } from '../../repositories/tournament.repository';
import { baseName } from '../../services/forum-scanner.service';

/** Finds an event by fuzzy title (distinctive-words match against stored events). */
export function findEventByOption(title: string): { id: number; title: string } | null {
  const want = baseName(title);
  if (!want) return null;
  const events = tournamentRepository.getAnnouncements();
  // Newest first for ties.
  for (let i = events.length - 1; i >= 0; i--) {
    const base = baseName(events[i].title);
    if (base.includes(want.slice(0, 10)) || want.includes(base.slice(0, 10))) {
      return { id: events[i].id, title: events[i].title };
    }
  }
  return null;
}

/**
 * The check-in board shared by /checkin and its buttons:
 * Registered (N) + Checked in (N) lists, check-in/cancel buttons for players,
 * refresh + ping-referee buttons for staff.
 */
export function buildCheckinBoard(eventId: number, guildId: string): {
  embeds: [EmbedBuilder];
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const participants = tournamentRepository.getParticipants(eventId);
  const checked = participants.filter((p) => p.checkedIn === 1);
  const missing = participants.filter((p) => p.checkedIn === 0);

  const detail = tournamentRepository.getEventDetail(eventId);
  const embed = new EmbedBuilder()
    .setTitle(`✅ Check-ins: ${detail?.title || `Event #${eventId}`}`)
    .setColor(0x57f287)
    .setDescription(
      'Registered players: press **Check In** so the referee knows you are ready.',
    )
    .addFields({
      name: `👥 Registered (${participants.length})`,
      value: participants.map((p) => p.name).join(', ').slice(0, 1024) || 'Nobody yet.',
      inline: false,
    })
    .addFields({
      name: `✅ Checked in (${checked.length}/${participants.length})`,
      value: checked.map((p) => p.name).join(', ').slice(0, 1024) || 'None yet.',
      inline: false,
    })
    .addFields({
      name: `⏳ Not checked in (${missing.length})`,
      value: missing.map((p) => p.name).join(', ').slice(0, 1024) || 'Everyone checked in. 🎉',
      inline: false,
    })
    .setFooter({ text: 'Lists merge forum registrations and Discord sign-ups.' });

  const playerRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`checkin_yes_${eventId}`)
      .setLabel('✅ Check In')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`checkin_no_${eventId}`)
      .setLabel('❌ Can\'t play')
      .setStyle(ButtonStyle.Danger),
  );
  const staffRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`checkin_refresh_${eventId}`)
      .setLabel('⟳ Refresh')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`checkin_pingref_${eventId}_${guildId}`)
      .setLabel('📢 Ping referee with summary')
      .setStyle(ButtonStyle.Primary),
  );
  return { embeds: [embed], components: [playerRow, staffRow] };
}
