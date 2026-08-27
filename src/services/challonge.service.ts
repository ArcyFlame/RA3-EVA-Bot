import axios from 'axios';
import { env } from '../config/env';
import { logger } from '../utils/logger';

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
        if (host === 'challonge.com' || host === 'www.challonge.com') return slug.toLowerCase();
        const subdomain = host.match(/^([a-z0-9][a-z0-9-]{0,30})\.challonge\.com$/i)?.[1];
        if (subdomain && subdomain.toLowerCase() !== 'www') {
          return `${subdomain}-${slug}`.toLowerCase();
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
    return `https://challonge.com/${identifier}`;
  }

  private async request<T>(endpoint: string, method = 'GET', data?: any): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const params: any = { api_key: env.CHALLONGE_API_KEY };
    if (env.CHALLONGE_SUBDOMAIN) params.subdomain = env.CHALLONGE_SUBDOMAIN;

    try {
      const response = await axios({ method, url, params, data, timeout: 10000 });
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        logger.debug(`Challonge tournament not found: ${endpoint}`);
      } else {
        logger.error(`Challonge API error: ${error.message}`);
      }
      throw new Error(`Challonge request failed: ${error.response?.data || error.message}`);
    }
  }

  async getTournament(tournamentId: string): Promise<ChallongeTournament> {
    const data = await this.request<{ tournament: ChallongeTournament }>(
      `/tournaments/${tournamentId}.json`,
    );
    return data.tournament;
  }

  async getMatches(tournamentId: string): Promise<ChallongeMatch[]> {
    const data = await this.request<any[]>(`/tournaments/${tournamentId}/matches.json`);
    // The API answers in snake_case; map to the interface's camelCase.
    return (Array.isArray(data) ? data : []).map((entry) => {
      const m = entry.match ?? entry;
      return {
        id: m.id as number,
        tournamentId: m.tournament_id as number,
        state: m.state as ChallongeMatch['state'],
        player1Id: m.player1_id ?? undefined,
        player2Id: m.player2_id ?? undefined,
        winnerId: m.winner_id ?? undefined,
        scoresCsv: m.scores_csv ?? undefined,
        scheduledTime: m.scheduled_time ?? undefined,
        round: m.round ?? undefined,
        identifier: m.identifier ?? undefined,
      };
    });
  }

  async getParticipants(tournamentId: string): Promise<ChallongeParticipant[]> {
    return (await this.getParticipantSnapshot(tournamentId)).participants;
  }

  /** One participant request supplies both names and final ranks, conserving API quota. */
  async getParticipantSnapshot(tournamentId: string): Promise<ChallongeParticipantSnapshot> {
    const data = await this.request<any[]>(`/tournaments/${tournamentId}/participants.json`);
    const rows = (Array.isArray(data) ? data : []).map((entry) => entry.participant ?? entry);
    const participants = rows.map((p: any) => ({
      id: p.id as number,
      name: p.name as string,
      tournamentId: p.tournament_id as number,
    }));
    const rankings = rows
      .map((p: any) => ({ rank: p.final_rank ?? null, name: p.name, id: p.id }))
      .filter((p) => p.rank !== null && p.rank > 0)
      .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
    return { participants, rankings };
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
