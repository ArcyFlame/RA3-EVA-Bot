import { ButtonInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { clanRepository } from '../../repositories/clan.repository';
import { isAdmin } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';
import { parseCustomIdInt } from '../../utils/parse';
import { audit } from '../../utils/logger';

/**
 * Clan manager remove: `clanmgr_del_{clanId}_{guildId}`. Admins/moderators
 * only — deletes role, channels and the database row.
 */
export const customIdPrefix = 'clanmgr_del_';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  if (!interaction.guild) return;

  const member = await resolveMember(interaction);
  if (!member || !isAdmin(member)) {
    await interaction.reply({ content: 'Admins only.', ephemeral: true });
    return;
  }

  const clanId = parseCustomIdInt(interaction.customId, 2);
  if (clanId === null) {
    await interaction.reply({ content: 'Invalid clan.', ephemeral: true });
    return;
  }
  const clan = clanRepository.findById(clanId, interaction.guild.id);
  if (!clan) {
    await interaction.reply({ content: 'Clan no longer exists.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const errors: string[] = [];
  if (clan.roleId) {
    try {
      await interaction.guild.roles.delete(clan.roleId, 'Clan removed via clan manager');
    } catch {
      errors.push('role');
    }
  }
  if (clan.textChannelId) {
    try {
      await interaction.guild.channels.delete(clan.textChannelId);
    } catch {
      errors.push('text channel');
    }
  }
  if (clan.voiceChannelId) {
    try {
      await interaction.guild.channels.delete(clan.voiceChannelId);
    } catch {
      errors.push('voice channel');
    }
  }
  clanRepository.rejectClan(clan.id);
  audit('clan_manager_remove', {
    clanId: clan.id,
    tag: clan.tag,
    guildId: interaction.guild.id,
    userId: interaction.user.id,
  });

  await interaction.editReply({
    content: errors.length
      ? `Clan **${clan.name}** removed from the database (could not delete: ${errors.join(', ')}).`
      : `Clan **${clan.name}** removed completely (role, channels, database).`,
  });
}
