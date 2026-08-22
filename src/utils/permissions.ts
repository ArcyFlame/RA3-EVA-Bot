import { GuildMember, PermissionFlagsBits } from 'discord.js';
import { guildRepository } from '../repositories/guild.repository';
import { env } from '../config/env';

/**
 * Permission model (most → least privileged):
 *
 *  owner      — env.OWNER_ID; gates destructive bot-level commands (/kill, /restart)
 *  admin      — guild owner, Discord Administrator permission, per-guild admin
 *               role (via /setup), env.ADMIN_ROLE_ID fallback, or owner
 *  referee    — per-guild referee role (tournament officials), or admin
 *  moderator  — Discord moderation permissions (kick/ban/timeout/manage messages), or admin
 *
 * All checks are synchronous: better-sqlite3 is synchronous, so the previous
 * async signatures only pretended to be non-blocking. `await fn()` keeps
 * working for legacy callers.
 */

export function isOwner(userId: string): boolean {
  return env.OWNER_ID !== null && userId === env.OWNER_ID;
}

export function isAdmin(member: GuildMember): boolean {
  if (isOwner(member.id)) return true;
  if (member.id === member.guild.ownerId) return true;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

  const guildData = guildRepository.findByDiscordId(member.guild.id);
  if (guildData?.adminRoleId && member.roles.cache.has(guildData.adminRoleId)) return true;

  // Global fallback role from env (useful before /setup has run).
  if (env.ADMIN_ROLE_ID && member.roles.cache.has(env.ADMIN_ROLE_ID)) return true;

  return false;
}

export function isReferee(member: GuildMember): boolean {
  if (isAdmin(member)) return true;
  const guildData = guildRepository.findByDiscordId(member.guild.id);
  return !!guildData?.refereeRoleId && member.roles.cache.has(guildData.refereeRoleId);
}

export function isAdminOrReferee(member: GuildMember): boolean {
  return isAdmin(member) || isReferee(member);
}

export function isModerator(member: GuildMember): boolean {
  if (isAdmin(member)) return true;
  return (
    member.permissions.has(PermissionFlagsBits.KickMembers) ||
    member.permissions.has(PermissionFlagsBits.BanMembers) ||
    member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
    member.permissions.has(PermissionFlagsBits.ManageMessages)
  );
}

/** Returns an error message when the check fails, null when it passes. */
export function denyUnlessAdmin(member: GuildMember | null): string | null {
  if (!member) return '❌ This command can only be used inside a server.';
  return isAdmin(member)
    ? null
    : '❌ You need the configured admin role (or Administrator permission) to use this command.';
}

export function denyUnlessOwner(userId: string): string | null {
  return isOwner(userId) ? null : '❌ This command is restricted to the bot owner.';
}
