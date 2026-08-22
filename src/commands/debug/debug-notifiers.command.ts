import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { RA3Bot } from '../../bot';
import { guildRepository } from '../../repositories/guild.repository';
import { trackedStreamerRepository } from '../../repositories/tracked-streamer.repository';
import { denyUnlessAdmin } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';
import { sanitizeInput } from '../../utils/sanitize';

export const data = new SlashCommandBuilder()
  .setName('debug_notifiers')
  .setDescription('[Admin] Debug notification settings')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Server only.', ephemeral: true });
    return;
  }
  const member = await resolveMember(interaction);
  const denial = denyUnlessAdmin(member);
  if (denial) {
    await interaction.reply({ content: denial, ephemeral: true });
    return;
  }

  const guildData = guildRepository.findByDiscordId(interaction.guild.id);
  if (!guildData) {
    await interaction.reply({ content: 'Guild not found in DB.', ephemeral: true });
    return;
  }
  const moddbChannel = guildData.moddbChannelId ? `<#${guildData.moddbChannelId}>` : '❌ Not set';
  const moddbEnabled = guildData.moddbNotifierEnabled ? '✅ Enabled' : '❌ Disabled';
  const twitchChannel = guildData.twitchChannelId
    ? `<#${guildData.twitchChannelId}>`
    : '❌ Not set';
  const twitchEnabled = guildData.twitchNotifierEnabled ? '✅ Enabled' : '❌ Disabled';
  const youtubeChannel = guildData.youtubeChannelId
    ? `<#${guildData.youtubeChannelId}>`
    : '❌ Not set';
  const youtubeEnabled = guildData.youtubeNotifierEnabled ? '✅ Enabled' : '❌ Disabled';
  const lobbyChannel = guildData.lobbyChannelId ? `<#${guildData.lobbyChannelId}>` : '❌ Not set';
  const lobbyEnabled = guildData.lobbyEnabled ? '✅ Enabled' : '❌ Disabled';

  const tracked = trackedStreamerRepository.findByGuild(interaction.guild.id);
  const trackedList = tracked.length
    ? tracked.map((t) => `${sanitizeInput(t.displayName, 50)} (${t.platform})`).join(', ')
    : 'None';

  await interaction.reply({
    content:
      `**ModDB**\nChannel: ${moddbChannel}\nEnabled: ${moddbEnabled}\n\n` +
      `**Twitch**\nChannel: ${twitchChannel}\nEnabled: ${twitchEnabled}\n\n` +
      `**YouTube**\nChannel: ${youtubeChannel}\nEnabled: ${youtubeEnabled}\n\n` +
      `**Lobby**\nChannel: ${lobbyChannel}\nEnabled: ${lobbyEnabled}\n\n` +
      `**Tracked streamers:** ${trackedList}`,
    ephemeral: true,
  });
}
