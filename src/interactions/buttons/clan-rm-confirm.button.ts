import { ButtonInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { clanRepository } from '../../repositories/clan.repository';
import { parseCustomIdInt } from '../../utils/parse';
import { audit } from '../../utils/logger';

/**
 * Confirm button for /clan_remove: `clan_rm_confirm_{clanId}_{guildId}`.
 * Only the clan leader (the user who saw the confirmation) may delete.
 */
export const customIdPrefix = 'clan_rm_confirm_';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  if (!interaction.guild) return;

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
  if (clan.ownerId !== interaction.user.id) {
    await interaction.reply({ content: 'Only the clan leader can delete this clan.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const errors: string[] = [];
  if (clan.roleId) {
    try {
      await interaction.guild.roles.delete(clan.roleId, 'Clan removed by leader');
    } catch {
      errors.push('role (may already be deleted)');
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
  audit('clan_remove_by_leader', {
    clanId: clan.id,
    tag: clan.tag,
    guildId: interaction.guild.id,
    userId: interaction.user.id,
  });

  await interaction.editReply({
    content: errors.length
      ? `Clan **${clan.name}** removed from the database, but could not delete: ${errors.join(', ')}.`
      : `Clan **${clan.name}** removed completely (role, channels, database).`,
  });
}
