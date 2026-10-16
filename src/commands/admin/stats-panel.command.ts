import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  TextChannel,
  ChannelType,
  RepliableInteraction,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { refreshSettings } from '../../repositories/refresh-settings.repository';
import { statsPanelRepository } from '../../repositories/stats-panel.repository';
import { denyUnlessAdmin } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';
import { ra3StatsService } from '../../services/ra3-stats.service';
import { StatsView } from '../stats/stats.view';
import { getGameContext } from '../../utils/game-context';

export const data = new SlashCommandBuilder()
  .setName('stats_panel')
  .setDescription('Set up an auto-updating stats panel')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub
      .setName('set')
      .setDescription('Set this channel as stats panel')
      .addChannelOption((opt) =>
        opt.setName('channel').setDescription('Text channel; omit to choose in the menu'),
      ),
  )
  .addSubcommand((sub) => sub.setName('disable').setDescription('Disable stats panel'));

export async function execute(bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  const action = interaction.options.getSubcommand();
  const channel =
    action === 'set' ? (interaction.options.getChannel('channel') as TextChannel | null) : null;
  if (action === 'set' && !channel) {
    const { openPanelMenu } = await import('./panel-menu.view');
    await openPanelMenu(interaction, 'stats');
    return;
  }
  await applyStatsPanel(bot, interaction, action, channel);
}

export async function applyStatsPanel(
  bot: RA3Bot,
  interaction: RepliableInteraction,
  sub: string,
  selected: TextChannel | null,
) {
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

  if (sub === 'set') {
    const channel = selected;
    if (
      !channel ||
      channel.guildId !== interaction.guild.id ||
      channel.type !== ChannelType.GuildText
    ) {
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

    const context = getGameContext(interaction.guild.id);
    const stats = await ra3StatsService.fetch(context.game, context.sources);
    const view = new StatsView(stats, context.game, context.sources);
    const msg = await channel.send({ embeds: [view.getEmbed()], components: view.getComponents() });
    statsPanelRepository.setPanel(interaction.guild.id, channel.id, msg.id);

    await interaction.editReply({
      content: `✅ Stats panel set in ${channel}. It will update every ${refreshSettings.minutes(interaction.guild.id, 'stats')} minutes.`,
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
