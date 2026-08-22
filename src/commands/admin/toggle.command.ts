import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { guildRepository } from '../../repositories/guild.repository';
import { denyUnlessAdmin } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';

export const data = new SlashCommandBuilder()
  .setName('toggle')
  .setDescription('Enable/disable bot features on this server')
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
    { name: 'News', key: 'news', emoji: '📰', enabled: guildData.newsEnabled === 1 },
  ];

  let menusModeEnabled = guildData.menusEnabled === 1;

  function buildEmbedFields() {
    return [
      ...features.map((f) => ({
        name: `${f.emoji} ${f.name}`,
        value: f.enabled ? '✅ Enabled' : '❌ Disabled',
        inline: true,
      })),
      {
        name: '🎛️ Interaction Mode',
        value: menusModeEnabled ? '✅ Menu Mode (buttons/menus)' : '⚡ Command Mode (plain text)',
        inline: false,
      },
    ];
  }

  const embed = new EmbedBuilder()
    .setTitle('⚙️ Feature Toggles')
    .setDescription('Click a button to toggle a feature ON/OFF')
    .setColor(0x5865f2)
    .addFields(...buildEmbedFields());

  function buildRows(): ActionRowBuilder<ButtonBuilder>[] {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    let currentRow = new ActionRowBuilder<ButtonBuilder>();
    for (let i = 0; i < features.length; i++) {
      const f = features[i];
      const button = new ButtonBuilder()
        .setCustomId(`feature_toggle_${f.key}`)
        .setLabel(f.name)
        .setStyle(f.enabled ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setEmoji(f.emoji);
      currentRow.addComponents(button);
      if ((i + 1) % 3 === 0 || i === features.length - 1) {
        rows.push(currentRow);
        currentRow = new ActionRowBuilder<ButtonBuilder>();
      }
    }
    rows[rows.length - 1]?.addComponents(
      new ButtonBuilder()
        .setCustomId('toggle_menus_mode')
        .setLabel('⚡ Menu/Command Mode')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('toggle_helpcats')
        .setLabel('📋 Help Categories')
        .setStyle(ButtonStyle.Secondary),
    );
    return rows;
  }

  const reply = await interaction.reply({
    embeds: [embed],
    components: buildRows(),
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

    // ✅ Acknowledge the button press immediately
    await btnInteraction.deferUpdate();

    // Per-guild help-category visibility (multi-select; selected = hidden).
    if (btnInteraction.customId === 'toggle_helpcats') {
      const allCats = ['tournaments', 'community', 'profile', 'info', 'admin', 'moderation'];
      const hiddenNow = guildRepository.getHiddenHelpCategories(interaction.guild!.id);
      const followUp = await btnInteraction.followUp({
        content: 'Select the help categories to HIDE on this server (empty selection shows all):',
        components: [
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('helpcat_select')
              .setMinValues(0)
              .setMaxValues(allCats.length)
              .addOptions(
                ...allCats.map((c) => ({
                  label: c.charAt(0).toUpperCase() + c.slice(1),
                  value: c,
                  default: hiddenNow.includes(c),
                })),
              ),
          ),
        ],
        ephemeral: true,
        fetchReply: true,
      });
      const catCollector = followUp.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 120000,
      });
      catCollector.on('collect', async (sel) => {
        if (sel.user.id !== interaction.user.id) {
          await sel.reply({ content: 'Not your menu.', ephemeral: true });
          return;
        }
        guildRepository.setHiddenHelpCategories(interaction.guild!.id, sel.values);
        await sel.update({
          content: `✅ Hidden categories: ${sel.values.length ? sel.values.join(', ') : 'none'} (all visible).`,
          components: [],
        });
        catCollector.stop();
      });
      return;
    }

    // Guild-wide preference: interactive menus vs plain command lists.
    if (btnInteraction.customId === 'toggle_menus_mode') {
      menusModeEnabled = !menusModeEnabled;
      guildRepository.setMenusEnabled(interaction.guild!.id, menusModeEnabled);
      const updatedEmbed = EmbedBuilder.from(embed).setFields(...buildEmbedFields());
      await btnInteraction.editReply({ embeds: [updatedEmbed], components: buildRows() });
      return;
    }

    const featureKey = btnInteraction.customId.replace('feature_toggle_', '');
    const feature = features.find((f) => f.key === featureKey);
    if (!feature) return;
    const newState = !feature.enabled;
    guildRepository.toggleFeature(interaction.guild!.id, featureKey, newState);
    feature.enabled = newState;

    // Update embed fields
    const updatedEmbed = EmbedBuilder.from(embed).setFields(...buildEmbedFields());

    await btnInteraction.editReply({ embeds: [updatedEmbed], components: buildRows() });
  });
}
