import {
  ButtonInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { guildRepository } from '../../repositories/guild.repository';
import { denyUnlessAdmin } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';

export const customId = 'setup_features';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
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
    await interaction.reply({ content: 'Guild not found.', ephemeral: true });
    return;
  }

  const features = [
    { name: 'Clans', key: 'clans', emoji: '👥', enabled: guildData.clansEnabled === 1 },
    {
      name: 'Tournaments',
      key: 'tournaments',
      emoji: '🏆',
      enabled: guildData.tournamentsEnabled === 1,
    },
    { name: 'Profiles', key: 'profiles', emoji: '👤', enabled: guildData.profilesEnabled === 1 },
    {
      name: 'Twitch Notifier',
      key: 'twitchNotifier',
      emoji: '📺',
      enabled: guildData.twitchNotifierEnabled === 1,
    },
    {
      name: 'YouTube Notifier',
      key: 'youtubeNotifier',
      emoji: '🎬',
      enabled: guildData.youtubeNotifierEnabled === 1,
    },
    {
      name: 'ModDB Updates',
      key: 'moddbNotifier',
      emoji: '📦',
      enabled: guildData.moddbNotifierEnabled === 1,
    },
    {
      name: 'Moderation',
      key: 'moderation',
      emoji: '🔨',
      enabled: guildData.moderationEnabled === 1,
    },
    { name: 'Lobby Tracker', key: 'lobby', emoji: '🎮', enabled: guildData.lobbyEnabled === 1 },
    {
      name: 'Stats Auto‑Update',
      key: 'statsAutoUpdate',
      emoji: '📊',
      enabled: guildData.statsAutoUpdateEnabled === 1,
    },
    {
      name: 'Welcome Messages',
      key: 'welcome',
      emoji: '👋',
      enabled: guildData.welcomeEnabled === 1,
    },
  ];

  const embed = new EmbedBuilder()
    .setTitle('⚙️ Feature Toggles')
    .setDescription('Click a button to toggle a feature ON/OFF')
    .setColor(0x5865f2)
    .addFields(
      features.map((f) => ({
        name: `${f.emoji} ${f.name}`,
        value: f.enabled ? '✅ Enabled' : '❌ Disabled',
        inline: true,
      })),
    );

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  let currentRow = new ActionRowBuilder<ButtonBuilder>();
  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    const button = new ButtonBuilder()
      .setCustomId(`setup_feature_toggle_${f.key}`)
      .setLabel(f.name)
      .setStyle(f.enabled ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setEmoji(f.emoji);
    currentRow.addComponents(button);
    if ((i + 1) % 3 === 0 || i === features.length - 1) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder<ButtonBuilder>();
    }
  }

  const reply = await interaction.reply({
    embeds: [embed],
    components: rows,
    fetchReply: true,
    ephemeral: true,
  });

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 300000,
  });
  collector.on('collect', async (btnInteraction) => {
    if (btnInteraction.user.id !== interaction.user.id) {
      await btnInteraction.reply({ content: 'Not your menu.', ephemeral: true });
      return;
    }
    const featureKey = btnInteraction.customId.replace('setup_feature_toggle_', '');
    const feature = features.find((f) => f.key === featureKey);
    if (!feature) return;
    const newState = !feature.enabled;
    guildRepository.toggleFeature(interaction.guild!.id, featureKey, newState);
    feature.enabled = newState;

    const updatedEmbed = EmbedBuilder.from(embed).setFields(
      features.map((f) => ({
        name: `${f.emoji} ${f.name}`,
        value: f.enabled ? '✅ Enabled' : '❌ Disabled',
        inline: true,
      })),
    );

    const newRows: ActionRowBuilder<ButtonBuilder>[] = [];
    let newRow = new ActionRowBuilder<ButtonBuilder>();
    for (let i = 0; i < features.length; i++) {
      const f = features[i];
      const button = new ButtonBuilder()
        .setCustomId(`setup_feature_toggle_${f.key}`)
        .setLabel(f.name)
        .setStyle(f.enabled ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setEmoji(f.emoji);
      newRow.addComponents(button);
      if ((i + 1) % 3 === 0 || i === features.length - 1) {
        newRows.push(newRow);
        newRow = new ActionRowBuilder<ButtonBuilder>();
      }
    }

    await btnInteraction.update({ embeds: [updatedEmbed], components: newRows });
  });
}
