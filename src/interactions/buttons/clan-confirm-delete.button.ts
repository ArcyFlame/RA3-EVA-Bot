import { ButtonInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { clanRepository } from '../../repositories/clan.repository';
import { parseCustomIdInt } from '../../utils/parse';
import { logger } from '../../utils/logger';

export const customIdPrefix = 'clan_confirm_delete_';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Server only.', ephemeral: true }).catch(() => null);
    return;
  }
  const guild = interaction.guild;

  const clanId = parseCustomIdInt(interaction.customId, 3);
  if (clanId === null) {
    await interaction.reply({ content: 'Invalid clan.', ephemeral: true });
    return;
  }
  const clan = clanRepository.findById(clanId);
  if (!clan || clan.ownerId !== interaction.user.id) {
    await interaction.reply({ content: 'Not authorized.', ephemeral: true });
    return;
  }

  await interaction.deferReply();
  try {
    // Delete best-effort so a missing role/channel never leaves a half-deleted clan.
    if (clan.roleId) {
      const role =
        guild.roles.cache.get(clan.roleId) ??
        (await guild.roles.fetch(clan.roleId).catch(() => null));
      if (role) await role.delete().catch(() => null);
    }
    if (clan.textChannelId) {
      const channel =
        guild.channels.cache.get(clan.textChannelId) ??
        (await guild.channels.fetch(clan.textChannelId).catch(() => null));
      if (channel) await channel.delete().catch(() => null);
    }
    if (clan.voiceChannelId) {
      const channel =
        guild.channels.cache.get(clan.voiceChannelId) ??
        (await guild.channels.fetch(clan.voiceChannelId).catch(() => null));
      if (channel) await channel.delete().catch(() => null);
    }
    clanRepository.deleteClan(clan.id);
    await interaction.editReply({ content: 'Clan deleted.' });
  } catch (error) {
    logger.error(`clan_confirm_delete: failed to delete clan ${clanId}:`, error);
    await interaction.editReply({
      content: '❌ Failed to delete the clan completely. Some roles/channels may remain.',
    });
  }
}
