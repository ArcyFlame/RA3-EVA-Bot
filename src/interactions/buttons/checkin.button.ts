import { ButtonInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { tournamentRepository } from '../../repositories/tournament.repository';
import { buildCheckinBoard } from '../../commands/tournaments/checkin.utils';
import { forumScanner } from '../../services/forum-scanner.service';
import { guildRepository } from '../../repositories/guild.repository';
import { parseIntSafe } from '../../utils/parse';
import { audit } from '../../utils/logger';
import { isAdminOrReferee } from '../../utils/permissions';
import { resolveTournamentStatus } from '../../utils/tournament-status';
import { userRepository } from '../../repositories/user.repository';
import { checkinNotificationService } from '../../services/checkin-notification.service';

/**
 * Check-in board buttons:
 *   checkin_yes_{eventId}        — player checks in (registers if needed)
 *   checkin_no_{eventId}         — player cancels their check-in
 *   checkin_refresh_{eventId}    — staff: re-scan forum + re-render
 *   checkin_pingref_{eventId}_{guildId} — staff: ping the referee role
 *   checkin_alerts_{eventId}_{guildId}  — referee: toggle personal DM alerts
 */
export const customIdPrefix = 'checkin_';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  if (!interaction.guild) return;
  const parts = interaction.customId.split('_'); // ['checkin', action, id, ...]
  const action = parts[1];
  const eventId = parseIntSafe(parts[2]);
  if (!eventId || !['yes', 'no', 'post', 'refresh', 'pingref', 'alerts'].includes(action)) {
    await interaction.reply({ content: 'Invalid button.', ephemeral: true });
    return;
  }

  // ── Player actions ─────────────────────────────────────────────────────
  if (action === 'yes' || action === 'no') {
    const detail = tournamentRepository.getEventDetail(eventId);
    if (!detail) {
      await interaction.reply({ content: 'This event no longer exists.', ephemeral: true });
      return;
    }
    if (
      resolveTournamentStatus({
        storedStatus: detail.status,
        startDate: detail.startDate,
        registrationUrl: detail.registrationUrl,
        checkinsUrl: detail.checkinsUrl,
      }) === 'ended'
    ) {
      await interaction.reply({ content: 'Check-in is closed for this tournament.', ephemeral: true });
      return;
    }
    // Register the Discord user (by display name) if not already on the list,
    // then flip their check-in flag.
    const member = interaction.member as { displayName?: string } | null;
    const displayName = member?.displayName || interaction.user.username;
    const participants = tournamentRepository.getParticipants(eventId);
    const known = participants.find(
      (p) =>
        p.discordId === interaction.user.id ||
        p.name.toLowerCase() === displayName.toLowerCase(),
    );
    if (!known && action === 'no') {
      await interaction.reply({
        content: 'You are not on this tournament registration list yet.',
        ephemeral: true,
      });
      return;
    }
    if (!known) {
      tournamentRepository.addParticipant(eventId, displayName, 'discord', interaction.user.id);
    } else if (!known.discordId) {
      tournamentRepository.linkParticipantDiscord(eventId, known.id, interaction.user.id);
    } else if (known.discordId !== interaction.user.id) {
      await interaction.reply({
        content: 'That tournament name is already linked to another Discord account. Ask a referee for help.',
        ephemeral: true,
      });
      return;
    }
    const linked = tournamentRepository.findParticipantByDiscord(eventId, interaction.user.id);
    const ok = linked
      ? tournamentRepository.setCheckedInByDiscord(eventId, interaction.user.id, action === 'yes')
      : tournamentRepository.setCheckedIn(eventId, known?.name ?? displayName, action === 'yes');
    if (!ok) {
      await interaction.reply({
        content: 'Could not update your check-in. Ask a referee to add you manually.',
        ephemeral: true,
      });
      return;
    }
    audit('checkin_toggle', { eventId, userId: interaction.user.id, action });
    const includeStaffControls = parts[3] !== 'player';
    await interaction.update(
      buildCheckinBoard(eventId, interaction.guild.id, includeStaffControls),
    );
    const activity = !known
      ? 'registered_and_checked_in'
      : action === 'yes'
        ? 'checked_in'
        : 'cancelled';
    void checkinNotificationService.notify(eventId, activity, [displayName]);
    return;
  }

  // ── Staff actions ──────────────────────────────────────────────────────
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const staff = member && isAdminOrReferee(member);
  if (!staff) {
    await interaction.reply({ content: 'Referees and admins only.', ephemeral: true });
    return;
  }

  if (action === 'post') {
    await interaction.deferReply({ ephemeral: true });
    const channel = interaction.channel;
    if (!channel || !('send' in channel)) {
      await interaction.editReply('I cannot post a check-in board in this channel.');
      return;
    }
    await channel.send(buildCheckinBoard(eventId, interaction.guild.id, true));
    await interaction.editReply('✅ Public check-in board posted.');
    return;
  }

  if (action === 'refresh') {
    await interaction.deferUpdate();
    const added = await forumScanner.refreshRegistrations(eventId);
    await interaction.editReply({
      ...buildCheckinBoard(eventId, interaction.guild.id),
      content: added >= 0 ? `⟳ Refreshed (+${added} from the forum).` : undefined,
    });
    return;
  }

  if (action === 'alerts') {
    const enabled = !userRepository.isRefereeCheckinDmEnabled(interaction.user.id);
    userRepository.setRefereeCheckinDmEnabled(interaction.user.id, enabled);
    await interaction.reply({
      content: enabled
        ? '✅ Referee registration and check-in DM alerts are now on.'
        : '🔕 Referee registration and check-in DM alerts are now off.',
      ephemeral: true,
    });
    return;
  }

  // pingref: summary + referee role mention (falls back to a plain summary).
  await interaction.deferUpdate();
  const participants = tournamentRepository.getParticipants(eventId);
  const checked = participants.filter((p) => p.checkedIn === 1);
  const missing = participants.filter((p) => p.checkedIn === 0);
  const guildData = guildRepository.findByDiscordId(interaction.guild.id);
  const refMention = guildData?.refereeRoleId ? `<@&${guildData.refereeRoleId}>` : 'Referees';
  const summary = [
    `${refMention} check-in summary:`,
    `✅ Checked in (${checked.length}):\n${checked.map((p, i) => `${i + 1}. ${p.name}`).join('\n') || 'none'}`,
    `⏳ Missing (${missing.length}):\n${missing.map((p, i) => `${i + 1}. ${p.name}`).join('\n') || 'none'}`,
  ].join('\n');
  await interaction.followUp({ content: summary.slice(0, 1900), allowedMentions: { roles: guildData?.refereeRoleId ? [guildData.refereeRoleId] : [] } });
}
