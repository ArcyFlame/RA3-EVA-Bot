import { ButtonInteraction, PermissionFlagsBits } from 'discord.js';
import { RA3Bot } from '../../bot';
import { tournamentRepository } from '../../repositories/tournament.repository';
import { buildCheckinBoard } from '../../commands/tournaments/checkin.utils';
import { forumScanner } from '../../services/forum-scanner.service';
import { guildRepository } from '../../repositories/guild.repository';
import { parseIntSafe } from '../../utils/parse';
import { audit } from '../../utils/logger';

/**
 * Check-in board buttons:
 *   checkin_yes_{eventId}        — player checks in (registers if needed)
 *   checkin_no_{eventId}         — player cancels their check-in
 *   checkin_refresh_{eventId}    — staff: re-scan forum + re-render
 *   checkin_pingref_{eventId}_{guildId} — staff: ping the referee role
 */
export const customIdPrefix = 'checkin_';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  if (!interaction.guild) return;
  const parts = interaction.customId.split('_'); // ['checkin', action, id, ...]
  const action = parts[1];
  const eventId = parseIntSafe(parts[2]);
  if (!eventId || !['yes', 'no', 'refresh', 'pingref'].includes(action)) {
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
    if (!known) {
      tournamentRepository.addParticipant(eventId, displayName, 'discord', interaction.user.id);
    } else if (!known.discordId) {
      tournamentRepository.addParticipant(eventId, known.name, 'discord', interaction.user.id);
    }
    const ok = tournamentRepository.setCheckedIn(eventId, displayName, action === 'yes');
    if (!ok) {
      await interaction.reply({
        content: 'Could not update your check-in. Ask a referee to add you manually.',
        ephemeral: true,
      });
      return;
    }
    audit('checkin_toggle', { eventId, userId: interaction.user.id, action });
    await interaction.update(buildCheckinBoard(eventId, interaction.guild.id));
    return;
  }

  // ── Staff actions ──────────────────────────────────────────────────────
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const staff =
    member &&
    (member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
      member.permissions.has(PermissionFlagsBits.ManageGuild) ||
      isReferee(member, interaction.guild.id));
  if (!staff) {
    await interaction.reply({ content: 'Referees and admins only.', ephemeral: true });
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

  // pingref: summary + referee role mention (falls back to a plain summary).
  await interaction.deferUpdate();
  const participants = tournamentRepository.getParticipants(eventId);
  const checked = participants.filter((p) => p.checkedIn === 1);
  const missing = participants.filter((p) => p.checkedIn === 0);
  const guildData = guildRepository.findByDiscordId(interaction.guild.id);
  const refMention = guildData?.refereeRoleId ? `<@&${guildData.refereeRoleId}>` : 'Referees';
  const summary = [
    `${refMention} check-in summary:`,
    `✅ Checked in (${checked.length}): ${checked.map((p) => p.name).join(', ') || 'none'}`,
    `⏳ Missing (${missing.length}): ${missing.map((p) => p.name).join(', ') || 'none'}`,
  ].join('\n');
  await interaction.followUp({ content: summary.slice(0, 1900), allowedMentions: { roles: guildData?.refereeRoleId ? [guildData.refereeRoleId] : [] } });
}

function isReferee(member: { roles: { cache: Map<string, unknown> } }, guildId: string): boolean {
  const guildData = guildRepository.findByDiscordId(guildId);
  if (!guildData?.refereeRoleId) return false;
  return member.roles.cache.has(guildData.refereeRoleId);
}
