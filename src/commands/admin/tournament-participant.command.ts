import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
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
    o.setName('event').setDescription('Tournament event ID').setMinValue(1).setRequired(true),
  )
  .addUserOption((o) =>
    o.setName('user').setDescription('Verified player Discord account').setRequired(true),
  )
  .addStringOption((o) =>
    o
      .setName('player')
      .setDescription('Exact registered tournament nickname')
      .setMaxLength(50)
      .setRequired(true),
  );
export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  const eventId = interaction.options.getInteger('event', true);
  if (!(await requireTournamentAccess(interaction, eventId))) return;
  const detail = tournamentRepository.getEventDetail(eventId);
  const user = interaction.options.getUser('user', true);
  const player = tournamentPlayerKey(interaction.options.getString('player', true));
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
