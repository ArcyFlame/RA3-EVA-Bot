import axios from 'axios';
import { logger } from '../utils/logger';
import { isKnownSkirmishMap, cleanMapName } from './ra3-stats.service';

export interface Lobby {
  players: string[];
  map: string;
  mode: '1v1' | '2v2' | '3v3' | '4v4' | 'FFA' | 'Unknown';
  platform: 'C&C Online' | 'RA3BattleNet';
}

export class LobbyService {
  async fetchActiveLobbies(): Promise<Lobby[]> {
    const lobbies: Lobby[] = [];

    // C&C Online
    try {
      const cncRes = await axios.get('https://cnc-online.net/api/serverinfo/?site=cnconline', {
        timeout: 5000,
      });
      const ra3 = cncRes.data.ra3 || {};
      const games = [...(ra3.games?.playing || []), ...(ra3.games?.staging || [])];
      for (const game of games) {
        let players: string[] = [];
        if (Array.isArray(game.players)) {
          players = game.players.map((p: any) => p.nickname || 'Unknown');
        } else if (game.players && typeof game.players === 'object') {
          players = Object.values(game.players).map((p: any) => p.nickname || 'Unknown');
        }
        if (players.length === 0) continue;
        const mode = this.getMode(players.length);
        const rawMap = game.map?.split('.')[0] || 'Unknown';
        if (!isKnownSkirmishMap(cleanMapName(rawMap))) continue;
        lobbies.push({
          players,
          map: rawMap,
          mode,
          platform: 'C&C Online',
        });
      }
    } catch (error) {
      logger.error('Failed to fetch C&C Online lobbies:', error);
    }

    // RA3BattleNet
    try {
      const ra3bRes = await axios.get('https://api.ra3battle.cn/api/server/status/detail', {
        timeout: 5000,
      });
      const games = ra3bRes.data.games || [];
      for (const game of games) {
        let players: string[] = [];
        if (Array.isArray(game.players)) {
          players = game.players.map((p: any) => p.name || 'Unknown');
        } else if (game.players && typeof game.players === 'object') {
          players = Object.values(game.players).map((p: any) => p.name || 'Unknown');
        }
        if (players.length === 0) continue;
        const mode = this.getMode(players.length);
        const mapName = cleanMapName(game.mapname || 'Unknown');
        if (!isKnownSkirmishMap(mapName)) continue;
        lobbies.push({
          players,
          map: mapName,
          mode,
          platform: 'RA3BattleNet',
        });
      }
    } catch (error) {
      logger.error('Failed to fetch RA3BattleNet lobbies:', error);
    }

    return lobbies;
  }

  private getMode(playerCount: number): Lobby['mode'] {
    if (playerCount === 2) return '1v1';
    if (playerCount === 4) return '2v2';
    if (playerCount === 6) return '3v3';
    if (playerCount === 8) return '4v4';
    return 'FFA';
  }

  async getLobbyForPlayer(playerName: string): Promise<Lobby | null> {
    const lobbies = await this.fetchActiveLobbies();
    return (
      lobbies.find((lobby) =>
        lobby.players.some((p) => p.toLowerCase() === playerName.toLowerCase()),
      ) || null
    );
  }
}

export const lobbyService = new LobbyService();
