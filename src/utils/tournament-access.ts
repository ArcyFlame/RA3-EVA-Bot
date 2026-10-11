import { GuildMember, RepliableInteraction } from 'discord.js';
import { tournamentAccessRepository } from '../repositories/tournament-access.repository';
import { isOwner, isTournamentStaff } from './permissions';

export function canManageTournament(member: GuildMember | null, eventId: number): boolean {
  return (
    !!member &&
    (isOwner(member.id) ||
      (isTournamentStaff(member) &&
        tournamentAccessRepository.organizer(eventId) === member.guild.id))
  );
}

export async function requireTournamentAccess(
  interaction: RepliableInteraction,
  eventId: number,
): Promise<boolean> {
  const member = interaction.guild
    ? await interaction.guild.members
        .fetch({ user: interaction.user.id, force: true })
        .catch(() => null)
    : null;
  if (canManageTournament(member, eventId)) return true;
  const payload = {
    content:
      'Only staff of the authorized organizer server can manage this tournament. The bot owner can assign it with /tournament organizer.',
    ephemeral: true,
    allowedMentions: { parse: [] as [] },
  };
  if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
  else await interaction.reply(payload);
  return false;
}
