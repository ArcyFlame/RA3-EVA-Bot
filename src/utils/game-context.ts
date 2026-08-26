import { GAME_CONFIGS, GameId } from '../config/games';
import { guildRepository } from '../repositories/guild.repository';
import { StatsSourceOptions } from '../services/ra3-stats.service';

export interface GameContext {
  game: GameId;
  config: (typeof GAME_CONFIGS)[GameId];
  sources: Required<StatsSourceOptions>;
}

export function getGameContext(guildId?: string | null): GameContext {
  const guild = guildId ? guildRepository.findByDiscordId(guildId) : undefined;
  const game = guild?.game ?? 'ra3';
  return {
    game,
    config: GAME_CONFIGS[game],
    sources: {
      cncOnline: guild?.cncOnlineEnabled !== 0,
      ra3BattleNet: guild?.ra3BattleNetEnabled !== 0,
    },
  };
}
