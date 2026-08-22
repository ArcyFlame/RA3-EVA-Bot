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
    // Pure numeric id.
    if (/^\d{1,12}$/.test(raw)) return raw;
    // URL forms.
    const match = raw.match(
      /^(?:https?:\/\/)?([a-z0-9][a-z0-9-]{0,30})\.challonge\.com\/([a-z0-9][a-z0-9-]{0,60})/i,
    );
    if (match) return `${match[1]}-${match[2]}`.toLowerCase();
    // Locale-prefixed path (challonge.com/zh_CN/stormgatheringBN): the locale
    // segment is not part of the tournament id.
    const locale = raw.match(
      /^(?:https?:\/\/)?(?:www\.)?challonge\.com\/[a-z]{2}(?:_[A-Za-z]{2})?\/([a-z0-9][a-z0-9-]{0,60})/i,
    );
    if (locale) return locale[1].toLowerCase();
    const plain = raw.match(/^(?:https?:\/\/)?(?:www\.)?challonge\.com\/([a-z0-9][a-z0-9-]{0,60})/i);
    if (plain) return plain[1].toLowerCase();
    // Bare slug.
    if (/^[a-z0-9][a-z0-9-]{0,60}$/i.test(raw)) return raw.toLowerCase();
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
      logger.error(`Challonge API error: ${error.message}`);
      throw new Error(`Challonge request failed: ${error.response?.data || error.message}`);
    }
  }

  async getTournament(tournamentId: string): Promise<any> {
    const data = await this.request<{ tournament: any }>(`/tournaments/${tournamentId}.json`);
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
    const data = await this.request<any[]>(`/tournaments/${tournamentId}/participants.json`);
    return (Array.isArray(data) ? data : [])
      .map((entry) => entry.participant ?? entry)
      .map((p: any) => ({
        id: p.id as number,
        name: p.name as string,
        tournamentId: p.tournament_id as number,
      }));
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
  async getFinalRankings(
    tournamentId: string,
  ): Promise<Array<{ rank: number | null; name: string; id: number }>> {
    const data = await this.request<any[]>(`/tournaments/${tournamentId}/participants.json`);
    return (Array.isArray(data) ? data : [])
      .map((entry) => entry.participant ?? entry)
      .map((p: any) => ({ rank: p.final_rank ?? null, name: p.name, id: p.id }))
      .filter((p) => p.rank !== null && p.rank > 0)
      .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
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
