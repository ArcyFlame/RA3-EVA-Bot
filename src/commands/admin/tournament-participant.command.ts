import {
  ChatInputCommandInteraction,
  RepliableInteraction,
  SlashCommandBuilder,
  User,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { tournamentRepository } from '../../repositories/tournament.repository';
import { guildRepository } from '../../repositories/guild.repository';
import { requireTournamentAccess } from '../../utils/tournament-access';
import { tournamentPlayerKey } from '../../utils/tournament-player-name';
import { tournamentAccessRepository } from '../../repositories/tournament-access.repository';
import { challongeService } from '../../services/challonge.service';

export const data = new SlashCommandBuilder()
  .setName('tournament_participant')
  .setDescription('Verify a registered player Discord association (organizer staff)')
  .addIntegerOption((o) =>
    o.setName('event').setDescription('Event ID; omit to choose in the menu').setMinValue(1),
  )
  .addUserOption((o) =>
    o.setName('user').setDescription('Discord member; omit to choose in the menu'),
  )
  .addStringOption((o) =>
    o.setName('player').setDescription('Exact registered tournament nickname').setMaxLength(50),
  );
export async function execute(bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  const eventId = interaction.options.getInteger('event');
  const user = interaction.options.getUser('user');
  const player = interaction.options.getString('player');
  if (!eventId || !user || !player) {
    const { openTournamentMenu } = await import('../tournaments/tournament-menu.view');
    await openTournamentMenu(bot, interaction, 'participant', eventId ?? undefined, user?.id);
    return;
  }
  await associateParticipant(interaction, eventId, user, player);
}

export async function associateParticipant(
  interaction: RepliableInteraction,
  eventId: number,
  user: User,
  playerName: string,
) {
  if (!(await requireTournamentAccess(interaction, eventId))) return;
  const detail = tournamentRepository.getEventDetail(eventId);
  const player = tournamentPlayerKey(playerName);
  const member = await interaction
    .guild!.members.fetch({ user: user.id, force: true })
    .catch(() => null);
  const candidates = tournamentRepository
    .getParticipants(eventId)
    .filter((p) => player && tournamentPlayerKey(p.name) === player);
  const participant = candidates.length === 1 ? candidates[0] : undefined;
  const ref = detail?.challongeUrl
    ? challongeService.parseTournamentRef(detail.challongeUrl)
    : null;
  const remoteId = ref ? tournamentAccessRepository.writableBracket(eventId, ref) : undefined;
  let external: { tournamentId: string; participantId: string } | undefined;
  await interaction.deferReply({ ephemeral: true });
  if (remoteId && participant) {
    const remote = (await challongeService.getParticipants(remoteId).catch(() => [])).filter(
      (p) => String(p.tournamentId) === remoteId && tournamentPlayerKey(p.name) === player,
    );
    if (remote.length === 1)
      external = { tournamentId: remoteId, participantId: String(remote[0].id) };
  }
  if (!(await requireTournamentAccess(interaction, eventId))) return;
  if (
    !detail ||
    detail.game !== guildRepository.findByDiscordId(interaction.guildId!)?.game ||
    !member ||
    user.bot ||
    !participant ||
    (external &&
      tournamentAccessRepository.writableBracket(eventId, external.tournamentId) !==
        external.tournamentId) ||
    !tournamentRepository.linkParticipantDiscord(eventId, participant.id, user.id, external, true)
  ) {
    await interaction.editReply({
      content:
        'Could not associate this player. Check the event, server member, and existing verified bindings.',
    });
    return;
  }
  await interaction.editReply({
    content: `Verified Discord association for participant #${participant.id} in event #${eventId}.${external ? ' Challonge player confirmed.' : ' Local association only; remote score sync is not enabled for this player.'}`,
  });
}
