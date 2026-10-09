import axios from 'axios';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { sourceGet } from '../utils/safe-fetch';

function sourceRows(data: unknown): Record<string, unknown>[] {
  const list = Array.isArray(data) ? data : (data as { data?: unknown })?.data;
  if (!Array.isArray(list)) throw new Error('Challonge response layout is not recognized');
  return list.map((entry) => {
    const wrapper = entry as Record<string, unknown> | null;
    const value = wrapper?.participant ?? wrapper?.match ?? wrapper;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Challonge response contains an invalid row');
    }
    const row = value as Record<string, unknown>;
    return row.attributes && typeof row.attributes === 'object'
      ? { ...(row.attributes as Record<string, unknown>), id: row.id }
      : row;
  });
}

function sourceId(value: unknown): number {
  if ((typeof value !== 'number' && typeof value !== 'string') || !/^\d+$/.test(String(value))) {
    throw new Error('Challonge response contains an invalid identifier');
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Challonge identifier is out of range');
  return id;
}

function optionalSourceId(value: unknown): number | undefined {
  return value == null ? undefined : sourceId(value);
}

export function parseChallongeMatches(data: unknown): ChallongeMatch[] {
  return sourceRows(data).map((m) => {
    if (!['pending', 'open', 'complete'].includes(String(m.state))) {
      throw new Error('Challonge match state is not recognized');
    }
    return {
      id: sourceId(m.id),
      tournamentId: sourceId(m.tournament_id ?? m.tournamentId),
      state: m.state as ChallongeMatch['state'],
      player1Id: optionalSourceId(m.player1_id ?? m.player1Id),
      player2Id: optionalSourceId(m.player2_id ?? m.player2Id),
      winnerId: optionalSourceId(m.winner_id ?? m.winnerId),
      scoresCsv:
        typeof (m.scores_csv ?? m.scoresCsv) === 'string'
          ? String(m.scores_csv ?? m.scoresCsv)
          : undefined,
      scheduledTime:
        typeof (m.scheduled_time ?? m.scheduledTime) === 'string'
          ? String(m.scheduled_time ?? m.scheduledTime)
          : undefined,
      round: typeof m.round === 'number' ? m.round : undefined,
      identifier: typeof m.identifier === 'string' ? m.identifier : undefined,
    };
  });
}

export function parseChallongeParticipants(data: unknown): ChallongeParticipantSnapshot {
  const rows = sourceRows(data).map((p) => {
    if (typeof p.name !== 'string' || !p.name.trim())
      throw new Error('Challonge participant name is missing');
    const rank = p.final_rank ?? p.finalRank;
    return {
      id: sourceId(p.id),
      name: p.name.trim(),
      tournamentId: sourceId(p.tournament_id ?? p.tournamentId),
      rank: rank == null || rank === 0 ? null : sourceId(rank),
    };
  });
  return {
    participants: rows.map(({ id, name, tournamentId }) => ({ id, name, tournamentId })),
    rankings: rows
      .filter((p) => p.rank !== null)
      .map(({ id, name, rank }) => ({ id, name, rank }))
      .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999)),
  };
}

export interface ChallongeMatch {
  id: number;
  tournamentId: number;
  state: 'pending' | 'open' | 'complete';
  player1Id?: number;
  player2Id?: number;
  winnerId?: number;
  scoresCsv?: string;
  scheduledTime?: string;
  round?: number;
  identifier?: string;
}

export interface ChallongeParticipant {
  id: number;
  name: string;
  tournamentId: number;
}

export interface ChallongeRanking {
  rank: number | null;
  name: string;
  id: number;
}

export interface ChallongeTournament {
  name?: string;
  state?: string;
  winner_id?: number;
  tournament_type?: string;
  participants_count?: number;
  game_name?: string;
  started_at?: string;
  start_at?: string;
  [key: string]: unknown;
}

export interface ChallongeParticipantSnapshot {
  participants: ChallongeParticipant[];
  rankings: ChallongeRanking[];
}

export class ChallongeService {
  private readonly baseUrl = 'https://api.challonge.com/v1';
  private readonly observedBracketUrls = new Map<string, string>();

  private rememberBracket(ref: string, url: string): string {
    if (this.observedBracketUrls.size >= 1000) {
      const oldest = this.observedBracketUrls.keys().next().value;
      if (oldest !== undefined) this.observedBracketUrls.delete(oldest);
    }
    this.observedBracketUrls.set(ref, url);
    return ref;
  }

  /**
   * Accepts anything a user can paste: a full URL (challonge.com/slug or
   * subdomain.challonge.com/slug, with or without protocol), a bare slug, or
   * a numeric id. Returns the API tournament identifier. Returns null for
   * anything that is not obviously a Challonge reference.
   */
  parseTournamentRef(input: string): string | null {
    const raw = input.trim();
    if (!raw) return null;
    if (/^\d{1,12}$/.test(raw)) return raw;

    const reserved = new Set([
      'about',
      'api',
      'assets',
      'communities',
      'contact',
      'dashboard',
      'features',
      'images',
      'login',
      'pricing',
      'privacy',
      'search',
      'settings',
      'signup',
      'static',
      'teams',
      'terms',
      'tournaments',
      'users',
    ]);
    const validSlug = (value: string | undefined): value is string =>
      !!value && /^[a-z0-9][a-z0-9-]{0,60}$/i.test(value) && !reserved.has(value.toLowerCase());

    if (/challonge\.com/i.test(raw)) {
      try {
        const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
        const host = parsed.hostname.toLowerCase();
        const parts = parsed.pathname.split('/').filter(Boolean);
        if (parts[0] && /^[a-z]{2}(?:_[a-z]{2})?$/i.test(parts[0])) parts.shift();
        const slug = parts[0];
        if (!validSlug(slug)) return null;
        if (host === 'challonge.com' || host === 'www.challonge.com') {
          return this.rememberBracket(slug.toLowerCase(), `https://challonge.com/${slug.toLowerCase()}`);
        }
        const subdomain = host.match(/^([a-z0-9][a-z0-9-]{0,30})\.challonge\.com$/i)?.[1];
        if (subdomain && subdomain.toLowerCase() !== 'www') {
          return this.rememberBracket(
            `${subdomain}-${slug}`.toLowerCase(),
            `https://${host}/${slug.toLowerCase()}`,
          );
        }
        return null;
      } catch {
        return null;
      }
    }
    if (validSlug(raw)) return raw.toLowerCase();
    return null;
  }

  /** Absolute bracket URL for an API identifier (for link buttons). */
  bracketUrl(identifier: string): string {
    return this.observedBracketUrls.get(identifier) ?? `https://challonge.com/${identifier}`;
  }

  private async request<T>(endpoint: string, method = 'GET', data?: any): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const params: any = { api_key: env.CHALLONGE_API_KEY };
    if (env.CHALLONGE_SUBDOMAIN) params.subdomain = env.CHALLONGE_SUBDOMAIN;

    try {
      const response =
        method === 'GET'
          ? await sourceGet<T>(url, { params, timeout: 10000 })
          : await axios({ method, url, params, data, timeout: 10000, maxRedirects: 0 });
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        logger.debug(`Challonge tournament not found: ${endpoint}`);
      } else {
        logger.error(`Challonge API error: ${error.message}`);
      }
      throw new Error(`Challonge request failed (${error.response?.status ?? 'unavailable'})`);
    }
  }

  async getTournament(tournamentId: string): Promise<ChallongeTournament> {
    const data = await this.request<{ tournament: ChallongeTournament }>(
      `/tournaments/${tournamentId}.json`,
    );
    const tournament = data?.tournament;
    if (
      !tournament ||
      typeof tournament !== 'object' ||
      typeof tournament.state !== 'string' ||
      ![
        'pending',
        'checking_in',
        'checked_in',
        'underway',
        'group_stages_underway',
        'group_stages_finalized',
        'awaiting_review',
        'complete',
      ].includes(tournament.state)
    ) {
      throw new Error('Challonge tournament response layout is not recognized');
    }
    return tournament;
  }

  async getMatches(tournamentId: string): Promise<ChallongeMatch[]> {
    const data = await this.request<any[]>(`/tournaments/${tournamentId}/matches.json`);
    return parseChallongeMatches(data);
  }

  async getParticipants(tournamentId: string): Promise<ChallongeParticipant[]> {
    return (await this.getParticipantSnapshot(tournamentId)).participants;
  }

  /** One participant request supplies both names and final ranks, conserving API quota. */
  async getParticipantSnapshot(tournamentId: string): Promise<ChallongeParticipantSnapshot> {
    const data = await this.request<any[]>(`/tournaments/${tournamentId}/participants.json`);
    return parseChallongeParticipants(data);
  }

  async updateMatchScore(
    tournamentId: string,
    matchId: number,
    scoresCsv: string,
    winnerId: number,
  ): Promise<void> {
    await this.request(`/tournaments/${tournamentId}/matches/${matchId}.json`, 'PUT', {
      match: { scores_csv: scoresCsv, winner_id: winnerId },
    });
  }

  async getTournamentWinner(tournamentId: string): Promise<string | null> {
    const tournament = await this.getTournament(tournamentId);
    if (tournament.state !== 'complete' || !tournament.winner_id) return null;
    const participants = await this.getParticipants(tournamentId);
    const winner = participants.find((p) => p.id === tournament.winner_id);
    return winner?.name || null;
  }

  /** Final rankings for a tournament (participants with final_rank, 1 = winner). */
  async getFinalRankings(tournamentId: string): Promise<ChallongeRanking[]> {
    return (await this.getParticipantSnapshot(tournamentId)).rankings;
  }

  /**
   * Winner by match results: when every match is complete but the organizer
   * hasn't finalized ("awaiting_review"), final_rank stays empty — the winner
   * of the last (highest-round) completed match is the champion.
   */
  async inferWinnerByMatches(tournamentId: string): Promise<string | null> {
    const [matches, participants] = await Promise.all([
      this.getMatches(tournamentId).catch(() => []),
      this.getParticipants(tournamentId).catch(() => []),
    ]);
    if (matches.length === 0 || matches.some((m) => m.state !== 'complete')) return null;
    const final = matches
      .filter((m) => m.winnerId)
      .sort((a, b) => (b.round ?? 0) - (a.round ?? 0) || b.id - a.id)[0];
    if (!final) return null;
    return participants.find((p) => p.id === final.winnerId)?.name ?? null;
  }
}

export const challongeService = new ChallongeService();
