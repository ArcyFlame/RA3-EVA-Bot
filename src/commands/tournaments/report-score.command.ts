import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  TextChannel,
  escapeMarkdown,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { guildRepository } from '../../repositories/guild.repository';
import {
  tournamentRepository,
  TournamentParticipant,
} from '../../repositories/tournament.repository';
import { userRepository } from '../../repositories/user.repository';
import { challongeService } from '../../services/challonge.service';
import { getCurrentTournament } from '../../services/tournament-context.service';
import { GameId, GAME_CONFIGS } from '../../config/games';

const FACTION_MATCHUPS = ['SvS', 'SvA', 'SvE', 'AvS', 'AvA', 'AvE', 'EvS', 'EvA', 'EvE'];
const GENEVO_FACTION_MATCHUPS = ['UvU', 'UvC', 'UvG', 'CvU', 'CvC', 'CvG', 'GvU', 'GvC', 'GvG'];
const COMMON_SCORES = [
  '1-0',
  '0-1',
  '2-0',
  '2-1',
  '1-2',
  '0-2',
  '3-0',
  '3-1',
  '3-2',
  '2-3',
  '1-3',
  '0-3',
];

export const data = new SlashCommandBuilder()
  .setName('report_score')
  .setDescription('Report a tournament result for referee approval')
  .addStringOption((option) =>
    option
      .setName('opponent')
      .setDescription('Tournament nickname of your checked-in opponent')
      .setAutocomplete(true)
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName('factions')
      .setDescription('Faction matchup: RA3 S/A/E or GenEvo U/C/G')
      .setAutocomplete(true)
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName('score')
      .setDescription('Series score, for example 2-1')
      .setAutocomplete(true)
      .setRequired(true),
  );

function gameFor(guildId: string | null): GameId {
  if (!guildId) return 'ra3';
  return guildRepository.findByDiscordId(guildId)?.game ?? 'ra3';
}

function checkedOpponents(eventId: number, userId: string): TournamentParticipant[] {
  return tournamentRepository
    .getParticipants(eventId)
    .filter((participant) => participant.checkedIn === 1 && participant.discordId !== userId);
}

export async function autocomplete(_bot: RA3Bot, interaction: AutocompleteInteraction) {
  const focused = interaction.options.getFocused(true);
  const query = String(focused.value ?? '').toLowerCase();
  if (focused.name === 'factions') {
    const matchups =
      gameFor(interaction.guildId) === 'genevo' ? GENEVO_FACTION_MATCHUPS : FACTION_MATCHUPS;
    await interaction.respond(
      matchups
        .filter((matchup) => matchup.toLowerCase().includes(query))
        .map((matchup) => ({ name: matchup, value: matchup })),
    );
    return;
  }
  if (focused.name === 'score') {
    await interaction.respond(
      COMMON_SCORES.filter((score) => score.startsWith(query)).map((score) => ({
        name: score,
        value: score,
      })),
    );
    return;
  }
  if (focused.name !== 'opponent' || !interaction.guildId) {
    await interaction.respond([]);
    return;
  }
  const event = getCurrentTournament(gameFor(interaction.guildId));
  const choices = event
    ? checkedOpponents(event.id, interaction.user.id)
        .filter((participant) => participant.name.toLowerCase().includes(query))
        .slice(0, 25)
        .map((participant) => ({
          name: participant.name.slice(0, 100),
          value: participant.name.slice(0, 100),
        }))
    : [];
  await interaction.respond(choices);
}

function resolveReporter(
  eventId: number,
  interaction: ChatInputCommandInteraction<'cached'>,
): TournamentParticipant | undefined {
  const linked = tournamentRepository.findParticipantByDiscord(eventId, interaction.user.id);
  if (linked) return linked;
  const account = userRepository.findByDiscordId(interaction.user.id);
  const names = [
    interaction.member.displayName,
    interaction.user.username,
    account?.shatabrickUsername,
    account?.ra3bUsername,
  ]
    .filter((name): name is string => !!name)
    .map((name) => name.toLowerCase());
  const participant = tournamentRepository
    .getParticipants(eventId)
    .find((entry) => entry.checkedIn === 1 && names.includes(entry.name.toLowerCase()));
  if (participant && !participant.discordId) {
    tournamentRepository.linkParticipantDiscord(eventId, participant.id, interaction.user.id);
    return { ...participant, discordId: interaction.user.id };
  }
  return participant?.discordId === interaction.user.id ? participant : undefined;
}

export async function execute(bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  if (!interaction.inCachedGuild()) {
    await interaction.reply({
      content: 'Score reporting is available inside a server.',
      ephemeral: true,
    });
    return;
  }
  const guildData = guildRepository.findByDiscordId(interaction.guild.id);
  if (guildData?.tournamentsEnabled === 0) {
    await interaction.reply({
      content: '❌ Tournaments are disabled on this server.',
      ephemeral: true,
    });
    return;
  }

  const event = getCurrentTournament(guildData?.game ?? 'ra3');
  if (!event) {
    await interaction.reply({
      content: 'I could not identify a current tournament.',
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setLabel(`View ${GAME_CONFIGS[guildData?.game ?? 'ra3'].shortLabel}`)
            .setStyle(ButtonStyle.Link)
            .setURL(GAME_CONFIGS[guildData?.game ?? 'ra3'].tournamentFallbackUrl),
        ),
      ],
      ephemeral: true,
    });
    return;
  }

  const reporter = resolveReporter(event.id, interaction);
  if (!reporter || reporter.checkedIn !== 1) {
    await interaction.reply({
      content: 'Check in for the current tournament before reporting a score.',
      ephemeral: true,
    });
    return;
  }

  const opponentInput = interaction.options.getString('opponent', true).trim();
  const opponent = checkedOpponents(event.id, interaction.user.id).find(
    (participant) => participant.name.toLowerCase() === opponentInput.toLowerCase(),
  );
  if (!opponent || opponent.id === reporter.id) {
    await interaction.reply({
      content: 'Select a different checked-in player from the opponent suggestions.',
      ephemeral: true,
    });
    return;
  }

  const factions = interaction.options.getString('factions', true);
  const validFactionMatchups =
    (guildData?.game ?? 'ra3') === 'genevo' ? GENEVO_FACTION_MATCHUPS : FACTION_MATCHUPS;
  if (!validFactionMatchups.includes(factions)) {
    await interaction.reply({ content: 'Invalid faction matchup.', ephemeral: true });
    return;
  }
  const scoreText = interaction.options.getString('score', true).trim();
  const scoreMatch = scoreText.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  if (!scoreMatch) {
    await interaction.reply({ content: 'Use a score such as `2-0` or `2-1`.', ephemeral: true });
    return;
  }
  const player1Score = Number(scoreMatch[1]);
  const player2Score = Number(scoreMatch[2]);
  if (player1Score === player2Score || Math.max(player1Score, player2Score) > 9) {
    await interaction.reply({
      content: 'The reported series must have one winner.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const challongeRef = event.challongeUrl
    ? challongeService.parseTournamentRef(event.challongeUrl)
    : null;
  let challongeMatchId = `local-${event.id}-${reporter.id}-${opponent.id}`;
  let player1Id = String(reporter.id);
  let player2Id = String(opponent.id);
  if (challongeRef) {
    const [participants, matches] = await Promise.all([
      challongeService.getParticipants(challongeRef).catch(() => []),
      challongeService.getMatches(challongeRef).catch(() => []),
    ]);
    const p1 = participants.find(
      (entry) => entry.name.toLowerCase() === reporter.name.toLowerCase(),
    );
    const p2 = participants.find(
      (entry) => entry.name.toLowerCase() === opponent.name.toLowerCase(),
    );
    const openMatch =
      p1 && p2
        ? matches.find(
            (match) =>
              match.state === 'open' &&
              ((match.player1Id === p1.id && match.player2Id === p2.id) ||
                (match.player1Id === p2.id && match.player2Id === p1.id)),
          )
        : undefined;
    if (p1 && p2 && openMatch) {
      challongeMatchId = String(openMatch.id);
      // Store score orientation in reporter/opponent order. The referee sync
      // handler maps it back to Challonge's player order before updating.
      player1Id = String(p1.id);
      player2Id = String(p2.id);
    }
  }

  const winnerId = player1Score > player2Score ? player1Id : player2Id;
  const reportId = tournamentRepository.insertMatch({
    tournamentId: challongeRef ?? `event:${event.id}`,
    challongeMatchId,
    player1Id,
    player2Id,
    player1Score,
    player2Score,
    winnerId,
    reportedBy: interaction.user.id,
    proofUrl: null,
    eventId: event.id,
    reporterParticipantId: reporter.id,
    opponentParticipantId: opponent.id,
    factionMatchup: factions,
  });

  const embed = new EmbedBuilder()
    .setTitle('⚔️ Tournament score awaiting review')
    .setColor(0xfaa61a)
    .setDescription(
      `**${escapeMarkdown(reporter.name)} ${player1Score}–${player2Score} ${escapeMarkdown(opponent.name)}**`,
    )
    .addFields(
      { name: 'Tournament', value: event.title.slice(0, 1024), inline: false },
      { name: 'Factions', value: factions, inline: true },
      { name: 'Reported by', value: `<@${interaction.user.id}>`, inline: true },
    )
    .setFooter({ text: `Report #${reportId}` })
    .setTimestamp();
  const reviewRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`score_review_approve_${reportId}_${interaction.guild.id}`)
      .setLabel('Approve')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`score_review_reject_${reportId}_${interaction.guild.id}`)
      .setLabel('Reject')
      .setStyle(ButtonStyle.Danger),
  );
  const payload = { embeds: [embed], components: [reviewRow] };

  let delivered = false;
  const disputes = guildData?.tournamentDisputesChannelId
    ? interaction.guild.channels.cache.get(guildData.tournamentDisputesChannelId)
    : null;
  if (disputes instanceof TextChannel) {
    const roleMention = guildData?.refereeRoleId ? `<@&${guildData.refereeRoleId}>` : undefined;
    await disputes.send({
      ...payload,
      content: roleMention,
      allowedMentions: { roles: guildData?.refereeRoleId ? [guildData.refereeRoleId] : [] },
    });
    delivered = true;
  } else if (guildData?.refereeRoleId) {
    const role = interaction.guild.roles.cache.get(guildData.refereeRoleId);
    for (const member of role?.members.values() ?? []) {
      await member
        .send(payload)
        .then(() => (delivered = true))
        .catch(() => null);
    }
  }
  if (!delivered) {
    const owner = await bot.client.users.fetch(interaction.guild.ownerId).catch(() => null);
    await owner
      ?.send(payload)
      .then(() => (delivered = true))
      .catch(() => null);
  }

  await interaction.editReply(
    delivered
      ? `✅ Score report #${reportId} was sent to the referees.`
      : `✅ Score report #${reportId} was saved, but no referee channel or reachable referee was found.`,
  );
}
