import { EmbedBuilder } from 'discord.js';
import { tournamentRepository } from '../../repositories/tournament.repository';
import { CRATE } from '../../utils/emojis';

export async function buildEventEmbed(eventId: number): Promise<EmbedBuilder | null> {
  const event = tournamentRepository.getEventDetail(eventId);
  if (!event) return null;
  const participantIds = tournamentRepository.getEventRegistrationIds(eventId, 21);
  const totalCount = tournamentRepository.getEventRegistrationCount(eventId);
  const embed = new EmbedBuilder()
    .setTitle(`🏆 ${event.title}`)
    .setDescription(event.description || 'A new Red Alert 3 tournament has been announced!')
    .setColor(0xff0000)
    .setURL(event.eventUrl);
  if (event.format) embed.addFields({ name: '⚔️ Format', value: event.format, inline: true });
  if (event.prizePool)
    embed.addFields({ name: `${CRATE} Main Prize`, value: event.prizePool, inline: true });
  if (event.startDate)
    embed.addFields({ name: '📅 Start Date', value: event.startDate, inline: true });
  if (event.maps) embed.addFields({ name: '🗺️ Map Pool', value: event.maps, inline: false });
  if (participantIds.length) {
    const mentions = participantIds
      .slice(0, 20)
      .map((id) => `<@${id}>`)
      .join('\n');
    embed.addFields({
      name: `📋 Registered Players (${totalCount})`,
      value: mentions + (totalCount > 20 ? `\n... and ${totalCount - 20} more` : ''),
      inline: false,
    });
  } else {
    embed.addFields({
      name: '📋 Registered Players (0)',
      value: 'No registrations yet.',
      inline: false,
    });
  }
  embed.setThumbnail('https://gamereplays.org/images/game_portals/redalert3_portal.jpg');
  embed.setFooter({ text: 'RA3 Esports • GameReplays.org' });
  return embed;
}

export async function buildResultsEmbed(resultId: number): Promise<EmbedBuilder | null> {
  const result = tournamentRepository.getResultDetail(resultId);
  if (!result) return null;
  const votes = tournamentRepository.getResultVoteCounts(resultId);
  let avgVote = 0;
  let totalVotes = 0;
  for (const v of votes) {
    totalVotes += v.count;
    avgVote += v.vote * v.count;
  }
  if (totalVotes > 0) avgVote /= totalVotes;
  const embed = new EmbedBuilder()
    .setTitle(`🏆 ${result.title} - Final Results`)
    .setDescription('The tournament has concluded! View the final bracket and submit your replays.')
    .setColor(0xffd700)
    .setURL(result.eventUrl);
  if (result.challongeUrl)
    embed.addFields({
      name: '🏅 Final Bracket',
      value: `[View on Challonge](${result.challongeUrl})`,
      inline: true,
    });
  if (totalVotes > 0) {
    const stars = '🌟'.repeat(Math.round(avgVote));
    embed.addFields({
      name: '⭐ Community Rating',
      value: `${stars} (${avgVote.toFixed(1)}/4.0) from ${totalVotes} vote(s)`,
      inline: false,
    });
  } else {
    embed.addFields({
      name: '⭐ Community Rating',
      value: 'No votes yet. Be the first!',
      inline: false,
    });
  }
  embed.setFooter({ text: `Announced: ${result.announcedAt.slice(0, 10)} • RA3 Esports • GameReplays.org` });
  return embed;
}
