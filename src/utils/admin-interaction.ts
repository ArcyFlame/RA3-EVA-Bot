import { RepliableInteraction } from 'discord.js';
import { denyUnlessAdmin } from './permissions';

/** Revalidate privileges for each click, including menus opened before a role change. */
export async function requireAdminInteraction(interaction: RepliableInteraction): Promise<boolean> {
  const member = interaction.guild
    ? await interaction.guild.members
        .fetch({ user: interaction.user.id, force: true })
        .catch(() => null)
    : null;
  const denial = denyUnlessAdmin(member);
  if (!denial) return true;
  const response = { content: denial, ephemeral: true, allowedMentions: { parse: [] as [] } };
  if (interaction.deferred || interaction.replied) await interaction.followUp(response);
  else await interaction.reply(response);
  return false;
}
