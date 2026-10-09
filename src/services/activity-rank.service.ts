import { createHash } from 'crypto';
import axios from 'axios';
import { Attachment, Guild, GuildMember, Message, PermissionFlagsBits, Role } from 'discord.js';
import {
  activityRankRepository,
  ActivityRankDefinition,
  MemberActivity,
} from '../repositories/activity-rank.repository';
import { guildRepository } from '../repositories/guild.repository';
import { audit, logger } from '../utils/logger';
import { env } from '../config/env';

export interface RankSyncResult {
  status:
    | 'updated'
    | 'unchanged'
    | 'not_configured'
    | 'missing_permission'
    | 'blocked_role'
    | 'disabled';
  rank?: ActivityRankDefinition;
  detail?: string;
}

export const MAX_REPLAY_BYTES = 10 * 1024 * 1024;

export function qualifyingChatHash(content: string): string | undefined {
  const normalized = content
    .replace(/<[^>]*>|https?:\/\/\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (
    /^[!/]/.test(content.trim()) ||
    normalized.length < 20 ||
    (normalized.match(/\p{L}/gu)?.length ?? 0) < 5
  )
    return;
  return createHash('sha256').update(normalized).digest('hex');
}

export function replayFingerprint(bytes: Buffer): string | null {
  if (bytes.length < 256 || bytes.length > MAX_REPLAY_BYTES) return null;
  if (bytes.subarray(0, 17).toString('ascii') !== 'RA3 REPLAY HEADER') return null;
  if (bytes[17] !== 4 && bytes[17] !== 5) return null;
  return createHash('sha256').update(bytes).digest('hex');
}

export function isReplayAttachment(
  attachment: Pick<Attachment, 'name' | 'size' | 'url'>,
  channelId: string,
): boolean {
  if (
    !attachment.name ||
    !/\.ra3replay$/i.test(attachment.name) ||
    attachment.size < 256 ||
    attachment.size > MAX_REPLAY_BYTES
  )
    return false;
  try {
    const url = new URL(attachment.url);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === '443') &&
      ['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname) &&
      url.pathname.startsWith('/attachments/' + channelId + '/')
    );
  } catch {
    return false;
  }
}

export function validateActivityRole(role: Role): string | null {
  if (role.id === role.guild.id || role.managed) return 'Choose an ordinary server role.';
  if (role.permissions.bitfield !== 0n)
    return 'Activity ranks must be cosmetic roles with no server permissions.';
  const settings = guildRepository.findByDiscordId(role.guild.id);
  if ([settings?.adminRoleId, settings?.refereeRoleId, env.ADMIN_ROLE_ID].includes(role.id))
    return 'Admin and referee roles cannot be awarded as activity ranks.';
  if (
    role.guild.channels.cache.some(
      (channel) =>
        'permissionOverwrites' in channel &&
        !!channel.permissionOverwrites.cache.get(role.id)?.allow.bitfield,
    )
  )
    return 'Activity ranks cannot grant channel access or channel permissions.';
  if (!role.editable) return 'Move the bot role above this activity role.';
  return null;
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

export class ActivityRankService {
  private replayDownloads = 0;
  private pendingMembers = new Set<string>();
  private syncingGuilds = new Set<string>();
  private rankSyncs = new Map<string, Promise<RankSyncResult>>();

  async downloadReplay(attachment: Attachment): Promise<string | null> {
    if (this.replayDownloads >= 4) return null;
    this.replayDownloads += 1;
    try {
      const response = await axios.get<ArrayBuffer>(attachment.url, {
        responseType: 'arraybuffer',
        timeout: 8000,
        maxRedirects: 0,
        maxContentLength: MAX_REPLAY_BYTES,
        maxBodyLength: MAX_REPLAY_BYTES,
      });
      return replayFingerprint(Buffer.from(response.data));
    } catch {
      return null;
    } finally {
      this.replayDownloads -= 1;
    }
  }

  async handleMessage(message: Message): Promise<void> {
    if (!message.guild || message.author.bot || message.webhookId || message.system) return;
    const guildData = guildRepository.findByDiscordId(message.guild.id);
    if (guildData?.activityRanksEnabled !== 1) return;
    const settings = activityRankRepository.getSettings(message.guild.id);
    const hasCncPing =
      settings.pingEnabled &&
      !!guildData.cncPingRoleId &&
      message.mentions.roles.has(guildData.cncPingRoleId);
    const replays =
      settings.replayEnabled &&
      settings.replayAutoScan &&
      message.channelId === settings.replayChannelId
        ? message.attachments.filter((attachment) =>
            isReplayAttachment(attachment, message.channelId),
          )
        : null;
    const chatContentHash = settings.chatEnabled
      ? qualifyingChatHash(message.content ?? '')
      : undefined;
    if (!hasCncPing && !replays?.size && !chatContentHash) return;
    const timestamp = message.createdTimestamp || Date.now();
    const activityDate = new Date(timestamp).toISOString().slice(0, 10);
    if (activityDate !== new Date().toISOString().slice(0, 10)) return;
    const key = message.guild.id + ':' + message.author.id;
    const replayFingerprints: string[] = [];
    const verifiedReplays: Array<{ attachment: Attachment; fingerprint: string }> = [];
    if (replays?.size && !this.pendingMembers.has(key)) {
      this.pendingMembers.add(key);
      try {
        for (const attachment of [...replays.values()].slice(0, settings.replayDailyCap)) {
          if (
            this.replayDownloads >= 4 ||
            !activityRankRepository.claimReplayDownload(
              message.guild.id,
              message.author.id,
              activityDate,
            )
          )
            break;
          const fingerprint = await this.downloadReplay(attachment);
          if (fingerprint) {
            replayFingerprints.push(fingerprint);
            verifiedReplays.push({ attachment, fingerprint });
          }
        }
      } finally {
        this.pendingMembers.delete(key);
      }
    }
    // Recheck the feature after downloads in case an admin changed the setup.
    const currentGuild = guildRepository.findByDiscordId(message.guild.id);
    if (currentGuild?.activityRanksEnabled !== 1) return;
    const currentSettings = activityRankRepository.getSettings(message.guild.id);
    const result = activityRankRepository.recordActivity({
      guildId: message.guild.id,
      userId: message.author.id,
      activityDate,
      hasCncPing:
        !!currentGuild.cncPingRoleId && message.mentions.roles.has(currentGuild.cncPingRoleId),
      replayFingerprints:
        currentSettings.replayAutoScan && message.channelId === currentSettings.replayChannelId
          ? replayFingerprints
          : [],
      chatContentHash,
      occurredAt: timestamp,
    });
    if (result.pointsAwarded === 0) return;
    if (currentGuild.game === 'genevo' && result.replaysAwarded > 0) {
      const { replayRatingService } = await import('./replay-rating.service');
      for (const replay of verifiedReplays) {
        const accepted = this.getReplayOwner(message.guild.id, replay.fingerprint);
        if (accepted === message.author.id)
          await replayRatingService.post(message, replay.attachment, replay.fingerprint);
      }
    }

    const definitions = activityRankRepository.getRankDefinitions(message.guild.id);
    const previousRank = rankForPoints(result.before.points, definitions);
    const currentRank = rankForPoints(result.after.points, definitions);

    const member =
      message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
    if (!member) return;
    const sync = await this.syncMemberRank(member, result.after);
    if (sync.status === 'updated' && currentRank && previousRank?.rank !== currentRank.rank) {
      audit('activity_rank_changed', {
        guildId: message.guild.id,
        userId: message.author.id,
        previousRank: previousRank?.rank ?? 0,
        currentRank: currentRank.rank,
        points: result.after.points,
      });
    }
  }

  async syncMemberRank(
    member: GuildMember,
    activity = activityRankRepository.getMember(member.guild.id, member.id),
  ): Promise<RankSyncResult> {
    const key = member.guild.id + ':' + member.id;
    const previous = this.rankSyncs.get(key);
    const next = (previous ?? Promise.resolve())
      .catch(() => undefined)
      .then(async (): Promise<RankSyncResult> => {
        const fresh = await member.guild.members
          .fetch({ user: member.id, force: true })
          .catch(() => null);
        if (!fresh) return { status: 'blocked_role', detail: 'The member is no longer available.' };
        if (guildRepository.findByDiscordId(member.guild.id)?.activityRanksEnabled !== 1)
          return { status: 'disabled', detail: 'Activity ranks are disabled.' };
        return this.applyMemberRank(
          fresh,
          activityRankRepository.getMember(member.guild.id, member.id) ?? activity,
        );
      })
      .finally(() => {
        if (this.rankSyncs.get(key) === next) this.rankSyncs.delete(key);
      });
    this.rankSyncs.set(key, next);
    return next;
  }

  private async applyMemberRank(
    member: GuildMember,
    activity?: MemberActivity,
  ): Promise<RankSyncResult> {
    if (member.user.bot) return { status: 'unchanged' };
    const definitions = activityRankRepository.getRankDefinitions(member.guild.id);
    const configured = definitions.filter((definition) => definition.roleId);
    const retiredRoleIds = activityRankRepository.getRetiredRoleIds(member.guild.id);
    if (configured.length === 0 && retiredRoleIds.length === 0) return { status: 'not_configured' };

    const botMember = member.guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return { status: 'missing_permission', detail: 'The bot needs Manage Roles.' };
    }

    const points = activity?.points ?? 0;
    const desired =
      activity?.manualRankId !== undefined
        ? configured.find((definition) => definition.id === activity.manualRankId)
        : configured
            .filter((definition) => points >= definition.threshold)
            .sort((a, b) => b.threshold - a.threshold || b.rank - a.rank)[0];
    const configuredRoles = [
      ...new Set([...configured.map((definition) => definition.roleId!), ...retiredRoleIds]),
    ]
      .map((id) => member.guild.roles.cache.get(id))
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
    const blocked = touchedRoles.find((role) => validateActivityRole(role));
    if (blocked) {
      return {
        status: 'blocked_role',
        rank: desired,
        detail: validateActivityRole(blocked)!,
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
    if (this.syncingGuilds.has(guild.id))
      throw new Error('A rank sync is already running on this server.');
    this.syncingGuilds.add(guild.id);
    const result = { updated: 0, unchanged: 0, failed: 0 };
    try {
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
    } finally {
      this.syncingGuilds.delete(guild.id);
    }
    return result;
  }

  getMemberActivity(guildId: string, userId: string): MemberActivity | undefined {
    return activityRankRepository.getMember(guildId, userId);
  }

  private getReplayOwner(guildId: string, fingerprint: string): string | undefined {
    return activityRankRepository.getReplayOwner(guildId, fingerprint);
  }
}

export const activityRankService = new ActivityRankService();
