import { ChannelType, EmbedBuilder, Guild, PermissionsBitField, TextChannel } from 'discord.js';
import { guildRepository } from '../repositories/guild.repository';
import { statsPanelRepository } from '../repositories/stats-panel.repository';

export async function testConfiguredChannels(guild: Guild): Promise<EmbedBuilder> {
  const guildData = guildRepository.findByDiscordId(guild.id);
  if (!guildData) {
    return new EmbedBuilder()
      .setTitle('🔧 Channel check')
      .setColor(0xed4245)
      .setDescription('Run `/bot_setup` first.');
  }
  const channels: Array<{ label: string; id?: string | null }> = [
    { label: '📰 News', id: guildData.newsChannelId },
    { label: '📦 ModDB', id: guildData.moddbChannelId },
    { label: '🎮 Twitch', id: guildData.twitchChannelId },
    { label: '▶️ YouTube', id: guildData.youtubeChannelId },
    { label: '🏆 Tournament events', id: guildData.tournamentEventsChannelId },
    { label: '⚔️ Tournament disputes', id: guildData.tournamentDisputesChannelId },
    { label: '🛠️ Lobby board', id: guildData.lobbyChannelId },
    { label: '🛡️ Clans', id: guildData.clanChannelId },
    { label: '📊 Stats panel', id: statsPanelRepository.get(guild.id)?.channelId },
  ];
  const me = guild.members.me;
  if (!me) {
    return new EmbedBuilder()
      .setTitle('🔧 Channel check')
      .setColor(0xed4245)
      .setDescription('Could not resolve the bot member. Try again in a moment.');
  }

  const lines: string[] = [];
  let ok = 0;
  let failed = 0;
  for (const entry of channels) {
    if (!entry.id) {
      lines.push(`${entry.label}: ⚪ not configured`);
      continue;
    }
    const channel = guild.channels.cache.get(entry.id);
    if (!channel || channel.type !== ChannelType.GuildText) {
      lines.push(`${entry.label}: ❌ channel missing or not a text channel`);
      failed++;
      continue;
    }
    const permissions = channel.permissionsFor(me);
    if (!permissions?.has([
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.EmbedLinks,
    ])) {
      lines.push(`${entry.label}: ❌ missing View Channel, Send Messages or Embed Links in <#${entry.id}>`);
      failed++;
      continue;
    }
    try {
      const message = await (channel as TextChannel).send({
        embeds: [
          new EmbedBuilder()
            .setTitle('✅ Channel test')
            .setDescription(`${entry.label} works. This message deletes itself in 5 seconds.`)
            .setColor(0x57f287),
        ],
      });
      setTimeout(() => message.delete().catch(() => null), 5000);
      lines.push(`${entry.label}: ✅ <#${entry.id}>`);
      ok++;
    } catch {
      lines.push(`${entry.label}: ❌ sending failed in <#${entry.id}>`);
      failed++;
    }
  }
  return new EmbedBuilder()
    .setTitle('🔧 Channel check')
    .setColor(failed > 0 ? 0xed4245 : 0x57f287)
    .setDescription(lines.join('\n').slice(0, 4000))
    .setFooter({ text: `${ok} working, ${failed} failing; test messages auto-delete` });
}
