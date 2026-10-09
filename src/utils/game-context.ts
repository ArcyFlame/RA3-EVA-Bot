import { GAME_CONFIGS, GameId } from '../config/games';
import { guildRepository } from '../repositories/guild.repository';
import { StatsSourceOptions } from '../services/ra3-stats.service';

export interface GameContext {
  game: GameId;
  config: (typeof GAME_CONFIGS)[GameId];
  sources: Required<StatsSourceOptions>;
  chartsEnabled: boolean;
  mastersEnabled: boolean;
}

export function getGameContext(guildId?: string | null): GameContext {
  const guild = guildId ? guildRepository.findByDiscordId(guildId) : undefined;
  const game = guild?.game ?? 'ra3';
  return {
    game,
    config: GAME_CONFIGS[game],
    chartsEnabled: guild?.chartsEnabled !== 0,
    mastersEnabled: (guild?.mastersEnabled !== 0 && game === 'ra3') || guild?.mastersEnabled === 1,
    sources: {
      cncOnline: guild?.cncOnlineEnabled !== 0,
      ra3BattleNet: guild?.ra3BattleNetEnabled !== 0,
    },
  };
}
