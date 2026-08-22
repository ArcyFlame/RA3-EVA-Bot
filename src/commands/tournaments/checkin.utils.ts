import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { tournamentRepository } from '../../repositories/tournament.repository';
import { findTournament } from '../../services/tournament-context.service';

/** Finds an event by fuzzy title (distinctive-words match against stored events). */
export function findEventByOption(title: string): { id: number; title: string } | null {
  const event = findTournament(title);
  return event ? { id: event.id, title: event.title } : null;
}

function numbered(names: string[], empty: string): string {
  if (names.length === 0) return empty;
  return names.map((name, index) => `${index + 1}. ${name}`).join('\n').slice(0, 1024);
}

/**
 * The check-in board shared by /checkin and its buttons:
 * Registered (N) + Checked in (N) lists, check-in/cancel buttons for players,
 * refresh + ping-referee buttons for staff.
 */
export function buildCheckinBoard(eventId: number, guildId: string, includeStaffControls = true): {
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
      value: numbered(participants.map((p) => p.name), 'Nobody yet.'),
      inline: false,
    })
    .addFields({
      name: `✅ Checked in (${checked.length}/${participants.length})`,
      value: numbered(checked.map((p) => p.name), 'None yet.'),
      inline: false,
    })
    .addFields({
      name: `⏳ Not checked in (${missing.length})`,
      value: numbered(missing.map((p) => p.name), 'Everyone checked in. 🎉'),
      inline: false,
    })
    .setFooter({ text: 'Lists merge forum registrations and Discord sign-ups.' });

  const playerRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`checkin_yes_${eventId}_${includeStaffControls ? 'staff' : 'player'}`)
      .setLabel('✅ Check In')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`checkin_no_${eventId}_${includeStaffControls ? 'staff' : 'player'}`)
      .setLabel('❌ Can\'t play')
      .setStyle(ButtonStyle.Danger),
  );
  const staffRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`checkin_post_${eventId}_${guildId}`)
      .setLabel('Post Check-in Board')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`checkin_refresh_${eventId}`)
      .setLabel('⟳ Refresh')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`checkin_pingref_${eventId}_${guildId}`)
      .setLabel('📢 Ping referee with summary')
      .setStyle(ButtonStyle.Primary),
  );
  return {
    embeds: [embed],
    components: includeStaffControls ? [playerRow, staffRow] : [playerRow],
  };
}
