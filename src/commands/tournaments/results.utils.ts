import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import {
  challongeService,
  ChallongeMatch,
  ChallongeParticipant,
} from '../../services/challonge.service';
import { tournamentRepository } from '../../repositories/tournament.repository';
import { parseForumTopics, RESULTS_FORUM_URL } from '../../services/tournament-scanner.service';
import { safeGetText } from '../../utils/safe-fetch';
import { editionsCompatible } from '../../services/forum-scanner.service';
import { GameId, matchesGameContent } from '../../config/games';

/**
 * Shared renderer for the /results browser (also used by the Results button
 * on event cards, so both show the exact same view). Navigation is stateless:
 * `resultspg_{prev|next}_{entryId}` - the list is re-fetched on every click.
 *
 * Entries come from the Challonge brackets DISCOVERED on the GameReplays
 * forum (the community hosts brackets on the organizer's account, not the
 * bot's), with the forum "…Brackets, Results and Replays" threads as
 * link-only fallback.
 */

/**
 * Titles that belong to other C&C games' scenes. RA3 servers must not see
 * these brackets (e.g. "Generals Evolution tournament 2v2"); GenEvo servers
 * keep ONLY these.
 */
/** True when an event title belongs to the guild's selected game scene. */
export function matchesGuildGame(title: string, game: GameId): boolean {
  return matchesGameContent(title, game);
}

export interface ResultsEntry {
  /** Event id for challonge entries; 1_000_000 + index for forum threads. */
  id: number;
  kind: 'challonge' | 'forum';
  title: string;
  url: string;
  challongeId?: string;
}

export interface ResultsList {
  source: 'challonge' | 'forum';
  entries: ResultsEntry[];
}

export function aggregateSeriesScore(scoresCsv?: string): [number, number] | null {
  if (!scoresCsv) return null;
  const pairs = scoresCsv
    .split(',')
    .map((part) => part.trim().match(/^(\d+)\s*-\s*(\d+)$/))
    .filter((match): match is RegExpMatchArray => !!match)
    .map((match) => [Number(match[1]), Number(match[2])] as [number, number]);
  if (pairs.length === 0) return null;
  if (pairs.length === 1) return pairs[0];
  let left = 0;
  let right = 0;
  for (const [a, b] of pairs) {
    if (a > b) left++;
    else if (b > a) right++;
  }
  return [left, right];
}

export function formatCompletedMatch(match: ChallongeMatch, names: Record<number, string>): string {
  const player1 = names[match.player1Id ?? 0] || 'TBD';
  const player2 = names[match.player2Id ?? 0] || 'TBD';
  const score = aggregateSeriesScore(match.scoresCsv);
  const scoreText = score ? `${score[0]}–${score[1]}` : 'completed';
  const winner = match.winnerId === match.player1Id ? player1 : player2;
  return `${player1} **${scoreText}** ${player2} → **${winner}**`;
}

/** Best-effort standings for old completed brackets without final_rank. */
export function deriveStandingsFromMatches(
  participants: ChallongeParticipant[],
  matches: ChallongeMatch[],
): Array<{ rank: number; name: string; id: number }> {
  const complete = matches.filter(
    (match) =>
      match.state === 'complete' &&
      match.player1Id != null &&
      match.player2Id != null &&
      match.winnerId != null,
  );
  if (complete.length === 0) return [];
  const final = [...complete].sort(
    (a, b) =>
      (b.round ?? Number.MIN_SAFE_INTEGER) - (a.round ?? Number.MIN_SAFE_INTEGER) || b.id - a.id,
  )[0];
  const championId = final.winnerId!;
  const runnerUpId = final.player1Id === championId ? final.player2Id! : final.player1Id!;

  const losses = new Map<number, number>();
  const wins = new Map<number, number>();
  for (const match of complete) {
    const loserId = match.player1Id === match.winnerId ? match.player2Id! : match.player1Id!;
    losses.set(loserId, Math.max(losses.get(loserId) ?? Number.MIN_SAFE_INTEGER, match.round ?? 0));
    wins.set(match.winnerId!, (wins.get(match.winnerId!) ?? 0) + 1);
  }

  const byId = new Map(participants.map((participant) => [participant.id, participant]));
  const orderedIds = [championId, runnerUpId];
  const remaining = participants
    .filter((participant) => !orderedIds.includes(participant.id))
    .sort(
      (a, b) =>
        (losses.get(b.id) ?? Number.MIN_SAFE_INTEGER) -
          (losses.get(a.id) ?? Number.MIN_SAFE_INTEGER) ||
        (wins.get(b.id) ?? 0) - (wins.get(a.id) ?? 0) ||
        a.name.localeCompare(b.name),
    );
  orderedIds.push(...remaining.map((participant) => participant.id));
  return orderedIds
    .map((id, index) => ({ rank: index + 1, name: byId.get(id)?.name ?? 'Unknown', id }))
    .filter((entry) => entry.name !== 'Unknown');
}

const FORUM_ID_OFFSET = 1_000_000;

async function fetchForumHtml(): Promise<string | undefined> {
  return safeGetText(RESULTS_FORUM_URL);
}

function forumEntries(topics: Array<{ title: string; url: string }>, game: GameId): ResultsEntry[] {
  return topics
    .filter((t) => /brackets?|results?|replays?/i.test(t.title))
    .filter((t) => matchesGuildGame(t.title, game))
    .slice(0, 10)
    .map((t, i) => ({
      id: FORUM_ID_OFFSET + i,
      kind: 'forum' as const,
      title: t.title,
      url: t.url,
    }));
}

/**
 * Discovered event brackets first (real standings); forum threads otherwise.
 * The game argument keeps each server's brackets isolated. Events
 * running SEVERAL brackets (group stage + playoffs, per-server qualifiers)
 * get one entry per bracket — negative entry ids address the extra brackets
 * by their tournament_brackets row id; the primary bracket keeps the event id
 * (that's what the event card's Results button links to).
 */
export async function fetchResultsList(game: GameId = 'ra3'): Promise<ResultsList> {
  const challongeEntries: ResultsEntry[] = [];
  for (const a of tournamentRepository.getAnnouncements(game)) {
    const brackets = tournamentRepository.getBrackets(a.id);
    const seen = new Set<string>();
    for (const bracket of brackets) {
      if (bracket.bracketName && !editionsCompatible(bracket.bracketName, a.title)) continue;
      const ref = challongeService.parseTournamentRef(bracket.challongeUrl);
      if (!ref || seen.has(bracket.challongeUrl)) continue;
      seen.add(bracket.challongeUrl);
      const label =
        bracket.bracketName &&
        bracket.bracketName.toLowerCase() !== a.title.toLowerCase() &&
        !a.title.toLowerCase().includes(bracket.bracketName.toLowerCase())
          ? `${a.title} - ${bracket.bracketName}`
          : a.title;
      challongeEntries.push({
        id: bracket.isPrimary ? a.id : -(a.id * 1000 + challongeEntries.length),
        kind: 'challonge',
        title: label,
        url: bracket.challongeUrl,
        challongeId: ref,
      });
    }
    // Events whose bracket predates the brackets table.
    if (seen.size === 0) {
      const detail = tournamentRepository.getEventDetail(a.id);
      const ref = detail?.challongeUrl
        ? challongeService.parseTournamentRef(detail.challongeUrl)
        : null;
      if (ref && detail?.challongeUrl) {
        challongeEntries.push({
          id: a.id,
          kind: 'challonge',
          title: a.title,
          url: challongeService.bracketUrl(ref),
          challongeId: ref,
        });
      }
    }
  }
  if (challongeEntries.length > 0) {
    return { source: 'challonge', entries: challongeEntries.reverse() };
  }

  if (game === 'genevo') return { source: 'forum', entries: [] };
  const html = await fetchForumHtml();
  if (!html) return { source: 'forum', entries: [] };
  return { source: 'forum', entries: forumEntries(parseForumTopics(html), game) };
}

/**
 * Podium + sequential standings fields shared by /results, the Results
 * button and /matches (Challonge ties would repeat "#5, #5" — positions are
 * numbered by finish order instead, top 10 overall).
 */
export function buildStandingsFields(
  rankings: Array<{ rank: number | null; name: string }>,
): Array<{ name: string; value: string; inline: boolean }> {
  const fields: Array<{ name: string; value: string; inline: boolean }> = [];
  const medals = ['🥇', '🥈', '🥉'];
  const podium = rankings.slice(0, 3);
  if (podium.length > 0) {
    fields.push({
      name: 'Podium',
      value: podium.map((p, i) => `${medals[i]} **${p.name}**`).join('\n'),
      inline: false,
    });
  }
  if (rankings.length > 3) {
    fields.push({
      name: 'Standings',
      value:
        rankings
          .slice(3, 10)
          .map((p, i) => `\`#${i + 4}\` ${p.name}`)
          .join('\n') + (rankings.length > 10 ? '\n...' : ''),
      inline: false,
    });
  }
  return fields;
}

export async function renderResultsPage(
  entry: ResultsEntry,
): Promise<{ embeds: [EmbedBuilder]; components: [ActionRowBuilder<ButtonBuilder>] } | null> {
  const embed = new EmbedBuilder().setColor(0xffd700);

  if (entry.kind === 'challonge' && entry.challongeId) {
    const [tournament, storedRankings, matches, participants] = await Promise.all([
      challongeService.getTournament(entry.challongeId!).catch(() => null),
      challongeService.getFinalRankings(entry.challongeId!).catch(() => []),
      challongeService.getMatches(entry.challongeId!).catch(() => []),
      challongeService.getParticipants(entry.challongeId!).catch(() => []),
    ]);

    embed
      .setTitle(`🏆 ${tournament?.name || entry.title}`)
      .setURL(entry.url)
      .setDescription('Final results from Challonge.');

    const infoBits: string[] = [];
    if (tournament?.tournament_type) {
      infoBits.push(
        String(tournament.tournament_type)
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase()),
      );
    }
    if (tournament?.participants_count) infoBits.push(`${tournament.participants_count} players`);
    if (infoBits.length) embed.setDescription(infoBits.join(' • '));

    const bracketEnded = ['complete', 'awaiting_review'].includes(String(tournament?.state));
    const rankings =
      storedRankings.length > 0
        ? storedRankings
        : bracketEnded ||
            (matches.length > 0 && matches.every((match) => match.state === 'complete'))
          ? deriveStandingsFromMatches(participants, matches)
          : [];

    if (rankings.length > 0) {
      embed.addFields(...buildStandingsFields(rankings));
    } else if (matches.length > 0) {
      // Bracket in progress: show the latest completed scores.
      const names: Record<number, string> = {};
      for (const p of participants) names[p.id] = p.name;
      const done = matches
        .filter((m) => m.state === 'complete')
        .slice(-5)
        .reverse();
      if (done.length > 0) {
        embed.addFields({
          name: 'Recent Matches',
          value: done
            .map((match) => formatCompletedMatch(match, names))
            .join('\n')
            .slice(0, 1024),
          inline: false,
        });
      }
    } else {
      embed.addFields({
        name: 'Standings',
        value: 'No final rankings recorded on Challonge for this tournament.',
        inline: false,
      });
    }
  } else {
    embed
      .setTitle(`📊 ${entry.title}`)
      .setURL(entry.url)
      .setDescription('Brackets, results and replays for this tournament.');
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`resultspg_prev_${entry.id}`)
      .setLabel('◀ Previous')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setLabel('Open').setStyle(ButtonStyle.Link).setURL(entry.url),
    new ButtonBuilder()
      .setCustomId(`resultspg_next_${entry.id}`)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row] };
}
