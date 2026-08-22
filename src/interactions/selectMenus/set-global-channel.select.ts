import { ChannelSelectMenuInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { guildRepository } from '../../repositories/guild.repository';
import { statsPanelRepository } from '../../repositories/stats-panel.repository';
import { wizardViews } from '../../commands/notifications/views';
import { postRecentIfChannelEmpty } from '../../services/content-bootstrap.service';

export const customIdPrefix = 'set_global_channel_';

export async function execute(bot: RA3Bot, interaction: ChannelSelectMenuInteraction) {
  if (!interaction.message) return;
  const view = wizardViews.get(interaction.message.id);
  if (!view) {
    await interaction.reply({
      content: 'Session expired. Please reopen the wizard.',
      ephemeral: true,
    });
    return;
  }
  if (view.ownerId !== interaction.user.id) {
    await interaction.reply({ content: 'Not your wizard.', ephemeral: true });
    return;
  }

  await interaction.deferUpdate();

  const channel = interaction.channels.first();
  if (!channel) {
    await interaction.editReply({ content: 'No channel selected.' });
    return;
  }

  if (!interaction.guild) {
    await interaction.editReply({ content: 'Server only.' });
    return;
  }

  const category = interaction.customId.replace('set_global_channel_', '');
  if (category === 'stats_panel') {
    // UPSERT that preserves the existing message_id/current_page (the old
    // INSERT OR REPLACE wiped them, breaking the live stats panel).
    statsPanelRepository.setChannel(interaction.guild.id, channel.id);
  } else {
    guildRepository.updateNotifyChannel(interaction.guild.id, category, channel.id);
  }

  const bootstrap = await postRecentIfChannelEmpty(
    bot.client,
    interaction.guild.id,
    category,
    channel.id,
  ).catch(() => 'unavailable' as const);
  await interaction.editReply({
    content:
      `✅ **${category}** channel set to ${channel}.` +
      (bootstrap === 'posted' ? ' The newest available post was added because the channel was empty.' : ''),
    components: [],
  });

  wizardViews.delete(interaction.message.id);
}
