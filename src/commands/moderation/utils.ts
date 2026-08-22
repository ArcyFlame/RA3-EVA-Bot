import { ChatInputCommandInteraction, Guild, GuildMember } from 'discord.js';
import { guildRepository } from '../../repositories/guild.repository';
import { isModerator } from '../../utils/permissions';
import { sanitizeInput } from '../../utils/sanitize';

/**
 * Shared guards for moderation commands. Each check returns an error message
 * (safe to show the invoker) or null when the action may proceed.
 */

export function moderationDisabled(guild: Guild): string | null {
  const guildData = guildRepository.findByDiscordId(guild.id);
  return guildData?.moderationEnabled === 0
    ? '❌ Moderation commands are disabled on this server.'
    : null;
}

/** Resolves the invoker as a full cached GuildMember (interaction.member can be partial). */
export async function resolveInvoker(
  interaction: ChatInputCommandInteraction,
): Promise<GuildMember | null> {
  if (!interaction.guild) return null;
  const cached = interaction.guild.members.cache.get(interaction.user.id);
  if (cached) return cached;
  return interaction.guild.members.fetch(interaction.user.id).catch(() => null);
}

export async function denyUnlessModerator(
  interaction: ChatInputCommandInteraction,
): Promise<{ invoker: GuildMember } | { error: string }> {
  if (!interaction.guild) return { error: '❌ This command can only be used inside a server.' };
  const invoker = await resolveInvoker(interaction);
  if (!invoker) return { error: '❌ Could not resolve your server membership.' };
  if (!isModerator(invoker)) {
    return { error: '❌ You need moderation permissions to use this command.' };
  }
  return { invoker };
}

/**
 * Target validation for ban/kick/timeout-style actions.
 */
export function checkTarget(
  guild: Guild,
  invoker: GuildMember,
  target: GuildMember,
): string | null {
  if (target.id === invoker.id) return '❌ You cannot moderate yourself.';
  if (target.id === guild.client.user.id) return '❌ You cannot moderate the bot.';
  if (target.id === guild.ownerId) return '❌ You cannot moderate the server owner.';

  // Role hierarchy: the invoker must outrank the target (owners bypass).
  if (invoker.id !== guild.ownerId) {
    const invokerHighest = invoker.roles.highest.position;
    const targetHighest = target.roles.highest.position;
    if (targetHighest >= invokerHighest) {
      return '❌ You cannot moderate a member with an equal or higher role than yours.';
    }
  }
  return null;
}

export const MAX_REASON_LENGTH = 512;

export function clampReason(reason: string | null | undefined): string {
  const value = (reason ?? '').trim() || 'No reason provided';
  const capped =
    value.length > MAX_REASON_LENGTH ? `${value.slice(0, MAX_REASON_LENGTH - 3)}...` : value;
  // Neutralize @everyone/@here so an echoed reason can't mass-ping the server.
  return sanitizeInput(capped);
}
