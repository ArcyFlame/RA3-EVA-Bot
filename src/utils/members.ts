import { GuildMember, Interaction } from 'discord.js';

/**
 * Resolves the invoker as a full cached GuildMember.
 *
 * `interaction.member` is a partial `APIInteractionGuildMember` when the member
 * is not cached, so calling `member.permissions`/`member.roles` on it directly is
 * unsafe. This fetches the full member (with a cache hit short-circuit) and
 * returns null when the interaction is outside a guild or the fetch fails.
 */
export async function resolveMember(interaction: Interaction): Promise<GuildMember | null> {
  if (!interaction.guild) return null;
  if (interaction.member instanceof GuildMember) return interaction.member;
  return interaction.guild.members.fetch(interaction.user.id).catch(() => null);
}
