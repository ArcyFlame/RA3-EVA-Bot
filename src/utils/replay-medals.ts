import { appSettingsRepository } from '../repositories/app-settings.repository';

export function replayMedal(score: number, guildId: string): string {
  const limits = appSettingsRepository.getReplayMedals(guildId);
  if (score >= limits.diamond) return '💎 Diamond Replay';
  if (score >= limits.gold) return '🥇 Gold Medal Replay';
  if (score >= limits.silver) return '🥈 Silver Medal Replay';
  if (score >= limits.bronze) return '🥉 Bronze Medal Replay';
  return '';
}
