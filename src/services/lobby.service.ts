import { sourceGet } from '../utils/safe-fetch';
import { logger } from '../utils/logger';
import { cleanMapName, StatsSourceOptions } from './ra3-stats.service';
import { GameId } from '../config/games';
import { matchesGameLobby } from '../data/game-maps';
import { summarizeMatch, MatchSummary } from '../utils/match-format';
import { mapCatalogService } from './map-catalog.service';

export interface Lobby {
  players: string[];
  map: string;
  mode: string;
  platform: 'C&C Online' | 'RA3BattleNet';
  summary?: MatchSummary;
}

export class LobbyService {
  async fetchActiveLobbies(
    gameId: GameId = 'ra3',
    sources: StatsSourceOptions = {},
  ): Promise<Lobby[]> {
    const fetchPlatform = async (platform: Lobby['platform']): Promise<Lobby[]> => {
      try {
        const cnc = platform === 'C&C Online';
        const { data } = await sourceGet(
          cnc
            ? 'https://cnc-online.net/api/serverinfo/?site=cnconline'
            : 'https://api.ra3battle.cn/api/server/status/detail',
          { timeout: 5000 },
        );
        const games = cnc
          ? [...(data.ra3?.games?.playing ?? []), ...(data.ra3?.games?.staging ?? [])]
          : (data.games ?? []);
        if (!Array.isArray(games)) return [];
        const out: Lobby[] = [];
        for (const game of games.slice(0, 100)) {
          const rawMap = cnc ? game.map : game.mapname;
          if (typeof rawMap !== 'string' || !matchesGameLobby(rawMap, game.mod, gameId)) continue;
          if (gameId === 'genevo')
            await mapCatalogService
              .observe(rawMap, game.mod, cnc ? 'cnc' : 'ra3b')
              .catch(() => undefined);
          const summary = summarizeMatch(game, platform, cleanMapName(rawMap, gameId));
          if (!summary.participants?.length) continue;
          out.push({
            players: summary.participants.map((p) => p.name),
            map: summary.map,
            mode: summary.mode ?? 'Unknown',
            platform,
            summary,
          });
        }
        return out;
      } catch (error) {
        logger.warn(`Failed to fetch ${platform} lobbies:`, error);
        return [];
      }
    };
    const rows = await Promise.all([
      sources.cncOnline === false ? [] : fetchPlatform('C&C Online'),
      sources.ra3BattleNet === false ? [] : fetchPlatform('RA3BattleNet'),
    ]);
    return rows.flat();
  }
  async getLobbyForPlayer(
    playerName: string,
    gameId: GameId = 'ra3',
    sources: StatsSourceOptions = {},
  ): Promise<Lobby | null> {
    return (
      (await this.fetchActiveLobbies(gameId, sources)).find((lobby) =>
        lobby.players.some((p) => p.toLowerCase() === playerName.toLowerCase()),
      ) ?? null
    );
  }
}
export const lobbyService = new LobbyService();
