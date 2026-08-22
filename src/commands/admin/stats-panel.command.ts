import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  TextChannel,
  ChannelType,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { statsPanelRepository } from '../../repositories/stats-panel.repository';
import { denyUnlessAdmin } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';
import { ra3StatsService } from '../../services/ra3-stats.service';
import { StatsView } from '../stats/stats.view';

export const data = new SlashCommandBuilder()
  .setName('stats_panel')
  .setDescription('Set up an auto-updating stats panel')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub
      .setName('set')
      .setDescription('Set this channel as stats panel')
      .addChannelOption((opt) =>
        opt.setName('channel').setDescription('Text channel').setRequired(true),
      ),
  )
  .addSubcommand((sub) => sub.setName('disable').setDescription('Disable stats panel'));

export async function execute(bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  if (!interaction.guild) {
    await interaction.editReply({ content: 'Server only.' });
    return;
  }
  const member = await resolveMember(interaction);
  const denial = denyUnlessAdmin(member);
  if (denial) {
    await interaction.editReply({ content: denial });
    return;
  }

  const sub = interaction.options.getSubcommand();
  if (sub === 'set') {
    const channel = interaction.options.getChannel('channel', true) as TextChannel;
    if (channel.type !== ChannelType.GuildText) {
      await interaction.editReply({ content: 'Must be a text channel.' });
      return;
    }
    const perms = channel.permissionsFor(bot.client.user!);
    if (!perms || !perms.has(['SendMessages', 'EmbedLinks', 'AttachFiles'])) {
      await interaction.editReply({
        content: 'I need Send Messages, Embed Links, and Attach Files permissions in that channel.',
      });
      return;
    }

    // Delete the previous panel from its *own* channel, not the new one.
    const existing = statsPanelRepository.get(interaction.guild.id);
    if (existing?.messageId && existing.channelId) {
      try {
        const oldChannel = await interaction.guild.channels.fetch(existing.channelId);
        if (oldChannel?.isTextBased()) await oldChannel.messages.delete(existing.messageId);
      } catch {
        // Old panel already gone.
      }
    }

    const stats = await ra3StatsService.fetch();
    const view = new StatsView(stats);
    const msg = await channel.send({ embeds: [view.getEmbed()], components: view.getComponents() });
    statsPanelRepository.setPanel(interaction.guild.id, channel.id, msg.id);

    await interaction.editReply({
      content: `✅ Stats panel set in ${channel}. It will update every 10 minutes.`,
    });
  } else if (sub === 'disable') {
    const config = statsPanelRepository.get(interaction.guild.id);
    if (config) {
      try {
        if (config.channelId && config.messageId) {
          const channel = await interaction.guild.channels.fetch(config.channelId);
          if (channel?.isTextBased())
            await (channel as TextChannel).messages.delete(config.messageId);
        }
      } catch {
        // Message already gone.
      }
      statsPanelRepository.delete(interaction.guild.id);
    }
    await interaction.editReply({ content: 'Stats panel disabled.' });
  }
}
