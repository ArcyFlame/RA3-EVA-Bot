import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ChannelType,
  PermissionsBitField,
  TextChannel,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { guildRepository } from '../../repositories/guild.repository';
import { statsPanelRepository } from '../../repositories/stats-panel.repository';
import { denyUnlessAdmin } from '../../utils/permissions';

export const data = new SlashCommandBuilder()
  .setName('test_channels')
  .setDescription('Check every configured channel: can the bot actually post there? (admin)');

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Server only.', ephemeral: true });
    return;
  }
  const denied = denyUnlessAdmin(interaction.member as any);
  if (denied) {
    await interaction.reply({ content: denied, ephemeral: true });
    return;
  }

  const guildData = guildRepository.findByDiscordId(interaction.guild.id);
  if (!guildData) {
    await interaction.reply({ content: 'Run /bot_setup first.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const channels: Array<{ label: string; id?: string | null }> = [
    { label: '📰 News', id: guildData.newsChannelId },
    { label: '📦 ModDB', id: guildData.moddbChannelId },
    { label: '🎮 Twitch', id: guildData.twitchChannelId },
    { label: '▶️ YouTube', id: guildData.youtubeChannelId },
    { label: '🏆 Tournament events', id: guildData.tournamentEventsChannelId },
    { label: '⚔️ Tournament disputes', id: guildData.tournamentDisputesChannelId },
    { label: '🛠️ Lobby board', id: guildData.lobbyChannelId },
    { label: '🛡️ Clans', id: guildData.clanChannelId },
    { label: '📊 Stats panel', id: statsPanelRepository.getAll().find((p) => p.guildId === interaction.guildId)?.channelId },
  ];

  const me = interaction.guild.members.me;
  if (!me) {
    await interaction.editReply('Could not resolve the bot member - try again.');
    return;
  }
  const lines: string[] = [];
  let ok = 0;
  let failed = 0;

  for (const entry of channels) {
    if (!entry.id) {
      lines.push(`${entry.label}: ⚪ not configured`);
      continue;
    }
    const channel = interaction.guild.channels.cache.get(entry.id);
    if (!channel || channel.type !== ChannelType.GuildText) {
      lines.push(`${entry.label}: ❌ channel missing or not a text channel`);
      failed++;
      continue;
    }
    const perms = channel.permissionsFor(me);
    if (!perms?.has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages])) {
      lines.push(`${entry.label}: ❌ no permission to post in <#${entry.id}>`);
      failed++;
      continue;
    }
    // Real end-to-end check: actually post (and clean up after ourselves).
    try {
      const msg = await (channel as TextChannel).send({
        embeds: [
          new EmbedBuilder()
            .setTitle('✅ Channel test')
            .setDescription(
              `${entry.label} works - the bot can post here.\nThis message deletes itself in 5 seconds.`,
            )
            .setColor(0x57f287),
        ],
      });
      setTimeout(() => msg.delete().catch(() => null), 5000);
      lines.push(`${entry.label}: ✅ <#${entry.id}>`);
      ok++;
    } catch {
      lines.push(`${entry.label}: ❌ sending failed in <#${entry.id}>`);
      failed++;
    }
  }

  const embed = new EmbedBuilder()
    .setTitle('🔧 Channel check')
    .setColor(failed > 0 ? 0xed4245 : 0x57f287)
    .setDescription(lines.join('\n').slice(0, 4000))
    .setFooter({ text: `${ok} working, ${failed} failing, test messages auto-delete` });
  await interaction.editReply({ embeds: [embed] });
}
