import { APIEmbedField, escapeMarkdown } from 'discord.js';
import { activityRankRepository } from '../../repositories/activity-rank.repository';
import { guildRepository } from '../../repositories/guild.repository';
import { nextRankForPoints, rankForPoints } from '../../services/activity-rank.service';

export function activitySummary(guildId: string, userId: string): APIEmbedField | undefined {
  if (guildRepository.findByDiscordId(guildId)?.activityRanksEnabled !== 1) return;
  const member = activityRankRepository.getMember(guildId, userId);
  const settings = activityRankRepository.getSettings(guildId);
  const ranks = activityRankRepository.getRankDefinitions(guildId);
  const points = member?.points ?? 0;
  const current = rankForPoints(points, ranks);
  const next = nextRankForPoints(points, ranks);
  const position = activityRankRepository.getMemberPosition(guildId, userId);
  const base = current?.threshold ?? 0;
  const ratio = next ? (points - base) / Math.max(1, next.threshold - base) : current ? 1 : 0;
  const filled = Math.max(0, Math.min(10, Math.floor(ratio * 10)));
  const override =
    member?.manualRankId !== undefined
      ? (ranks.find((r) => r.id === member.manualRankId)?.title ?? 'No rank role')
      : undefined;
  return {
    name: '🎖️ Server Activity',
    value: [
      `**${escapeMarkdown(current?.title ?? 'Recruit')}** - **${points.toLocaleString()} XP** · Level **${Math.floor(points / settings.xpPerLevel)}**${position ? ` · #${position}` : ''}`,
      `\`${'█'.repeat(filled)}${'░'.repeat(10 - filled)}\` ${next ? `${(next.threshold - points).toLocaleString()} XP to ${escapeMarkdown(next.title)}` : current ? 'Highest rank reached' : 'No ranks configured'}`,
      `${member?.qualifyingCncPings ?? 0} daily pings · ${member?.qualifyingReplays ?? 0} replay uploads`,
      override ? `Staff role override: **${escapeMarkdown(override)}**` : '',
      'Pings count once per UTC day. Ordinary chat earns no XP.',
    ]
      .filter(Boolean)
      .join('\n'),
    inline: false,
  };
}
