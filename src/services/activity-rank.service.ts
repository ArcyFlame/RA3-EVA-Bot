import { createHash } from 'crypto';
import { Guild, GuildMember, Message, PermissionFlagsBits, Role } from 'discord.js';
import {
  activityRankRepository,
  ActivityRankDefinition,
  DEFAULT_ACTIVITY_RANKS,
  MemberActivity,
} from '../repositories/activity-rank.repository';
import { guildRepository } from '../repositories/guild.repository';
import { audit, logger } from '../utils/logger';

export interface RankSyncResult {
  status: 'updated' | 'unchanged' | 'not_configured' | 'missing_permission' | 'blocked_role';
  rank?: ActivityRankDefinition;
  detail?: string;
}

export function normalizeActivityText(content: string): string {
  return content
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/https?:\/\/\S+/giu, ' link ')
    .replace(/<@!?\d+>|<@&\d+>|<#\d+>/g, ' ')
    .replace(/<a?:([\w-]+):\d+>/g, ' $1 ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function isMeaningfulActivity(content: string, attachmentNames: string[] = []): boolean {
  const normalized = normalizeActivityText(content);
  const textCharacters = normalized.replace(/\s/g, '').length;
  return textCharacters >= 4 || attachmentNames.length > 0;
}

export function activityFingerprint(content: string, attachmentNames: string[] = []): string {
  const normalized = normalizeActivityText(content);
  const attachments = attachmentNames.map((name) => name.toLocaleLowerCase('en-US')).sort();
  return createHash('sha256')
    .update(`${normalized}\n${attachments.join('\n')}`)
    .digest('hex');
}

export function rankForPoints(
  points: number,
  definitions: ActivityRankDefinition[],
): ActivityRankDefinition | undefined {
  return definitions
    .filter((definition) => points >= definition.threshold)
    .sort((a, b) => b.threshold - a.threshold || b.rank - a.rank)[0];
}

export function nextRankForPoints(
  points: number,
  definitions: ActivityRankDefinition[],
): ActivityRankDefinition | undefined {
  return definitions
    .filter((definition) => points < definition.threshold)
    .sort((a, b) => a.threshold - b.threshold || a.rank - b.rank)[0];
}

function onlineRankNumber(role: Role): number | null {
  const match = role.name.match(/\bonline\s+rank\s*([1-9])\b/i);
  return match ? Number(match[1]) : null;
}

export class ActivityRankService {
  async handleMessage(message: Message): Promise<void> {
    if (!message.guild || message.author.bot || message.webhookId || message.system) return;
    const guildData = guildRepository.findByDiscordId(message.guild.id);
    if (!guildData || guildData.activityRanksEnabled !== 1) return;

    const attachmentNames = [
      ...message.attachments.map((attachment) => attachment.name ?? 'attachment'),
      ...message.stickers.map((sticker) => sticker.name),
    ];
    const hasCncPing =
      !!guildData.cncPingRoleId && message.mentions.roles.has(guildData.cncPingRoleId);
    const meaningfulMessage = isMeaningfulActivity(message.content, attachmentNames);
    if (!hasCncPing && !meaningfulMessage) return;

    const timestamp = message.createdTimestamp || Date.now();
    const result = activityRankRepository.recordActivity({
      guildId: message.guild.id,
      userId: message.author.id,
      nowMs: timestamp,
      activityDate: new Date(timestamp).toISOString().slice(0, 10),
      meaningfulMessage,
      fingerprint: meaningfulMessage
        ? activityFingerprint(message.content, attachmentNames)
        : undefined,
      hasCncPing,
    });
    if (result.pointsAwarded === 0) return;

    const definitions = activityRankRepository.getRankDefinitions(message.guild.id);
    const previousRank = rankForPoints(result.before.points, definitions);
    const currentRank = rankForPoints(result.after.points, definitions);
    if (previousRank?.rank === currentRank?.rank) return;

    const member =
      message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
    if (!member) return;
    const sync = await this.syncMemberRank(member, result.after);
    if (sync.status === 'updated' && currentRank) {
      audit('activity_rank_changed', {
        guildId: message.guild.id,
        userId: message.author.id,
        previousRank: previousRank?.rank ?? 0,
        currentRank: currentRank.rank,
        points: result.after.points,
      });
    }
  }

  autoConfigureRoles(guild: Guild): { configured: number[]; missing: number[] } {
    const detected = new Map<number, Role>();
    const existing = activityRankRepository.getRankDefinitions(guild.id);
    for (const role of guild.roles.cache.values()) {
      const rank = onlineRankNumber(role);
      if (rank && !role.managed && role.id !== guild.id) detected.set(rank, role);
    }
    for (const defaults of DEFAULT_ACTIVITY_RANKS) {
      const role = detected.get(defaults.rank);
      if (role) {
        const threshold =
          existing.find((definition) => definition.rank === defaults.rank)?.threshold ??
          defaults.threshold;
        activityRankRepository.setRankRole(guild.id, defaults.rank, role.id, threshold);
      }
    }
    const configured = [...detected.keys()].sort((a, b) => a - b);
    const missing = DEFAULT_ACTIVITY_RANKS.map((rank) => rank.rank).filter(
      (rank) => !detected.has(rank),
    );
    return { configured, missing };
  }

  async syncMemberRank(
    member: GuildMember,
    activity = activityRankRepository.getMember(member.guild.id, member.id),
  ): Promise<RankSyncResult> {
    if (member.user.bot) return { status: 'unchanged' };
    const definitions = activityRankRepository.getRankDefinitions(member.guild.id);
    const configured = definitions.filter((definition) => definition.roleId);
    if (configured.length === 0) return { status: 'not_configured' };

    const botMember = member.guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return { status: 'missing_permission', detail: 'The bot needs Manage Roles.' };
    }

    const points = activity?.points ?? 0;
    const desired = configured
      .filter((definition) => points >= definition.threshold)
      .sort((a, b) => b.threshold - a.threshold || b.rank - a.rank)[0];
    const configuredRoles = configured
      .map((definition) => member.guild.roles.cache.get(definition.roleId!))
      .filter((role): role is Role => !!role);
    const desiredRole = desired?.roleId ? member.guild.roles.cache.get(desired.roleId) : undefined;

    const rolesToRemove = configuredRoles.filter(
      (role) => member.roles.cache.has(role.id) && role.id !== desiredRole?.id,
    );
    const needsAdd = !!desiredRole && !member.roles.cache.has(desiredRole.id);
    if (!needsAdd && rolesToRemove.length === 0) {
      return { status: 'unchanged', rank: desired };
    }

    const touchedRoles = [...rolesToRemove, ...(needsAdd && desiredRole ? [desiredRole] : [])];
    const blocked = touchedRoles.find((role) => !role.editable);
    if (blocked) {
      return {
        status: 'blocked_role',
        rank: desired,
        detail: `Move the bot role above “${blocked.name}”.`,
      };
    }

    try {
      if (needsAdd && desiredRole) {
        await member.roles.add(desiredRole, 'Discord activity rank');
      }
      if (rolesToRemove.length > 0) {
        await member.roles.remove(rolesToRemove, 'Discord activity rank changed');
      }
      return { status: 'updated', rank: desired };
    } catch (error) {
      logger.warn(`Could not update activity rank for ${member.id} in ${member.guild.id}:`, error);
      return { status: 'blocked_role', rank: desired, detail: 'Discord rejected the role update.' };
    }
  }

  async syncGuild(guild: Guild): Promise<{ updated: number; unchanged: number; failed: number }> {
    const result = { updated: 0, unchanged: 0, failed: 0 };
    for (const userId of activityRankRepository.getTrackedUserIds(guild.id)) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) {
        result.failed += 1;
        continue;
      }
      const sync = await this.syncMemberRank(member);
      if (sync.status === 'updated') result.updated += 1;
      else if (sync.status === 'unchanged') result.unchanged += 1;
      else result.failed += 1;
    }
    return result;
  }

  getMemberActivity(guildId: string, userId: string): MemberActivity | undefined {
    return activityRankRepository.getMember(guildId, userId);
  }
}

export const activityRankService = new ActivityRankService();
