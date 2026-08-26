import { tournamentRepository } from '../repositories/tournament.repository';
import { parsePortalDate, resolveTournamentStatus } from '../utils/tournament-status';
import { GameId } from '../config/games';

export function normalizeTournamentName(title: string): string {
  return title
    .toLowerCase()
    .replace(/brackets?|results|replays|streams|registrations?|check[- ]?ins|sign[- ]?ups?/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface TournamentContext {
  id: number;
  title: string;
  eventUrl: string;
  startDate?: string;
  registrationUrl?: string;
  checkinsUrl?: string;
  challongeUrl?: string;
  topicUrl?: string;
  maps?: string;
  status: ReturnType<typeof resolveTournamentStatus>;
}

function toContext(
  event: ReturnType<typeof tournamentRepository.getAnnouncements>[number],
): TournamentContext {
  const detail = tournamentRepository.getEventDetail(event.id);
  const registrationUrl = detail?.registrationUrl ?? event.signUpUrl ?? undefined;
  return {
    id: event.id,
    title: event.title,
    eventUrl: event.eventUrl,
    startDate: event.startDate ?? undefined,
    registrationUrl,
    checkinsUrl: detail?.checkinsUrl ?? undefined,
    challongeUrl: detail?.challongeUrl ?? undefined,
    topicUrl: detail?.topicUrl ?? undefined,
    maps: detail?.maps ?? undefined,
    status: resolveTournamentStatus({
      storedStatus: detail?.status,
      startDate: event.startDate,
      registrationUrl,
      checkinsUrl: detail?.checkinsUrl,
    }),
  };
}

export function listTournamentContexts(game: GameId = 'ra3'): TournamentContext[] {
  return tournamentRepository
    .getAnnouncements(game)
    .sort((a, b) => {
      const aDate = parsePortalDate(a.startDate ?? '') ?? a.id;
      const bDate = parsePortalDate(b.startDate ?? '') ?? b.id;
      return bDate - aDate;
    })
    .map(toContext);
}

export function getCurrentTournament(game: GameId = 'ra3'): TournamentContext | null {
  const events = listTournamentContexts(game);
  return events.find((event) => event.status !== 'ended') ?? null;
}

export function findTournament(query: string, game: GameId = 'ra3'): TournamentContext | null {
  const wanted = normalizeTournamentName(query);
  if (!wanted) return getCurrentTournament(game);
  const events = listTournamentContexts(game);
  return (
    events.find((event) => normalizeTournamentName(event.title) === wanted) ??
    events.find((event) => {
      const candidate = normalizeTournamentName(event.title);
      return candidate.includes(wanted) || wanted.includes(candidate);
    }) ??
    null
  );
}
