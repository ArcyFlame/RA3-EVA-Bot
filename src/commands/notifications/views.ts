import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  StringSelectMenuInteraction,
  ButtonInteraction,
  ChannelSelectMenuBuilder,
  ChannelType,
  Message,
  Guild,
} from 'discord.js';
import { guildRepository } from '../../repositories/guild.repository';
import { statsPanelRepository } from '../../repositories/stats-panel.repository';
import { logger } from '../../utils/logger';

/** Live wizard sessions keyed by the message id currently hosting the wizard UI. */
export const wizardViews = new Map<string, GuildChannelsWizardView>();

export class NotificationsMainView {
  constructor(private isAdmin: boolean) {}

  buildEmbed(): EmbedBuilder {
    const embed = new EmbedBuilder().setTitle('🔔 Notification Settings').setColor(0x5865f2);
    if (this.isAdmin) {
      embed
        .setDescription('Configure server-wide notifications and your personal settings.')
        .addFields(
          {
            name: '📡 Tracked Streamers',
            value: 'Add or remove Twitch/YouTube channels to track.',
            inline: false,
          },
          {
            name: '📢 Global Channels',
            value:
              'Set server-wide announcement channels (clans, tournaments, streams, news).',
            inline: false,
          },
          {
            name: '🧪 Test Posts',
            value: 'Send a one-off post per service to verify each channel works.',
            inline: false,
          },
          {
            name: '🔔 Personal Settings',
            value: 'Toggle private DM notifications and pick your language.',
            inline: false,
          },
        );
    } else {
      embed
        .setDescription('Manage which personal notifications you receive via DM.')
        .addFields({
          name: '🔔 Personal Settings',
          value:
            'Toggle private DM notifications for events that concern you (e.g., tournament matches, clan invites) and pick your language.',
          inline: false,
        });
    }
    return embed.setFooter({ text: 'Click a button below to configure.' });
  }

  getComponents(): ActionRowBuilder<ButtonBuilder>[] {
    const row = new ActionRowBuilder<ButtonBuilder>();
    if (this.isAdmin) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('tracked_streamers')
          .setLabel('📡 Tracked Streamers')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('global_channels')
          .setLabel('📢 Global Channels')
          .setStyle(ButtonStyle.Secondary),
      );
    }
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('personal_dm')
        .setLabel('🔔 Personal Settings')
        .setStyle(ButtonStyle.Success),
    );
    if (this.isAdmin) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('notif_test')
          .setLabel('🧪 Test Posts')
          .setStyle(ButtonStyle.Primary),
      );
    }
    return [row];
  }
}

export class GuildChannelsWizardView {
  private selectedCategory: string = 'clan';
  private guild: Guild;
  private originalMessage: Message | null = null;
  public readonly ownerId: string;
  private categories = [
    { label: 'Clan Requests', value: 'clan', emoji: '👥' },
    { label: 'Tournament Disputes', value: 'tournament', emoji: '🏆' },
    { label: 'Twitch Streams', value: 'twitch', emoji: '📺' },
    { label: 'YouTube Videos', value: 'youtube', emoji: '🎬' },
    { label: 'Tournament Events', value: 'tournament_events', emoji: '📢' },
    { label: 'Stats Panel', value: 'stats_panel', emoji: '📊' },
    { label: 'ModDB Updates', value: 'moddb', emoji: '📦' },
    { label: 'Lobby Updates', value: 'lobby', emoji: '🎮' },
    { label: 'RA3 News', value: 'news', emoji: '📰' },
  ];

  constructor(guild: Guild, ownerId: string) {
    this.guild = guild;
    this.ownerId = ownerId;
  }

  setOriginalMessage(msg: Message) {
    this.originalMessage = msg;
  }

  async refreshWizard() {
    if (!this.originalMessage) return;
    try {
      await this.originalMessage.edit({
        embeds: [this.buildEmbed()],
        components: this.getComponents(),
      });
    } catch (error) {
      // The wizard message is ephemeral and Discord may already have invalidated
      // it once the interaction chain moved on. The channel was already saved and
      // the confirmation shown, so fail soft rather than crash the handler.
      logger.warn('refreshWizard: could not refresh wizard message:', error);
    }
  }

  buildEmbed(): EmbedBuilder {
    const guildData = guildRepository.findByDiscordId(this.guild.id);
    const getChannel = (id: string | undefined): string => {
      try {
        if (!id) return '❌ Not set';
        const ch = this.guild.channels.cache.get(id);
        if (!ch) return '❌ Deleted channel';
        return ch.toString();
      } catch (err) {
        logger.warn('Error getting channel mention:', err);
        return '❌ Error';
      }
    };
    const statsChannelId = this.getStatsChannelId();
    const statsMention = statsChannelId ? getChannel(statsChannelId) : '❌ Not set';

    const fields = [
      { name: '👥 Clan Requests', value: getChannel(guildData?.clanChannelId), inline: true },
      {
        name: '🏆 Tournament Disputes',
        value: getChannel(guildData?.tournamentDisputesChannelId),
        inline: true,
      },
      { name: '📺 Twitch Streams', value: getChannel(guildData?.twitchChannelId), inline: true },
      { name: '🎬 YouTube Videos', value: getChannel(guildData?.youtubeChannelId), inline: true },
      {
        name: '📢 Tournament Events',
        value: getChannel(guildData?.tournamentEventsChannelId),
        inline: true,
      },
      { name: '📊 Stats Panel', value: statsMention, inline: true },
      { name: '📦 ModDB Updates', value: getChannel(guildData?.moddbChannelId), inline: true },
      { name: '🎮 Lobby Updates', value: getChannel(guildData?.lobbyChannelId), inline: true },
    ];

    for (const field of fields) {
      if (typeof field.value !== 'string') field.value = String(field.value);
    }

    return new EmbedBuilder()
      .setTitle('📢 Global Notification Channels')
      .setDescription(
        `Currently selected: **${this.categories.find((c) => c.value === this.selectedCategory)?.label}**`,
      )
      .setColor(0x5865f2)
      .addFields(fields);
  }

  getComponents(): ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] {
    const select = new StringSelectMenuBuilder()
      .setCustomId('global_channel_select')
      .setPlaceholder('Select a category')
      .addOptions(
        this.categories.map((cat) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(cat.label)
            .setValue(cat.value)
            .setEmoji(cat.emoji)
            .setDefault(cat.value === this.selectedCategory),
        ),
      );
    const setBtn = new ButtonBuilder()
      .setCustomId('global_set_channel')
      .setLabel('Set Channel')
      .setStyle(ButtonStyle.Primary);
    const clearBtn = new ButtonBuilder()
      .setCustomId('global_clear_channel')
      .setLabel('Clear Selected')
      .setStyle(ButtonStyle.Danger);
    const clearAllBtn = new ButtonBuilder()
      .setCustomId('global_clear_all')
      .setLabel('Clear All Channels')
      .setStyle(ButtonStyle.Danger);
    const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(setBtn, clearBtn, clearAllBtn);
    return [row1, row2];
  }

  private getStatsChannelId(): string | undefined {
    return statsPanelRepository.get(this.guild.id)?.channelId ?? undefined;
  }

  /** Deletes the live stats-panel message before clearing its config (avoids a zombie panel). */
  private async deleteStatsPanelMessage(): Promise<void> {
    const panel = statsPanelRepository.get(this.guild.id);
    if (!panel?.channelId || !panel.messageId) return;
    const channel = await this.guild.channels.fetch(panel.channelId).catch(() => null);
    if (channel?.isTextBased()) {
      await channel.messages.delete(panel.messageId).catch(() => null);
    }
  }

  async handleSelect(interaction: StringSelectMenuInteraction) {
    await interaction.deferUpdate();
    this.selectedCategory = interaction.values[0];
    await interaction.editReply({ embeds: [this.buildEmbed()], components: this.getComponents() });
  }

  async handleSet(interaction: ButtonInteraction) {
    await interaction.deferReply({ ephemeral: true });
    const channelSelect = new ChannelSelectMenuBuilder()
      .setCustomId(`set_global_channel_${this.selectedCategory}`)
      .setPlaceholder('Select a text channel')
      .setChannelTypes([ChannelType.GuildText]);
    const row = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelSelect);
    const reply = await interaction.editReply({
      content: `Select a channel for **${this.selectedCategory}**:`,
      components: [row],
    });
    wizardViews.set(reply.id, this);
    setTimeout(
      () => {
        wizardViews.delete(reply.id);
      },
      10 * 60 * 1000,
    );
  }

  async handleClear(interaction: ButtonInteraction) {
    await interaction.deferUpdate();
    if (this.selectedCategory === 'stats_panel') {
      await this.deleteStatsPanelMessage();
      statsPanelRepository.delete(this.guild.id);
    } else {
      guildRepository.updateNotifyChannel(this.guild.id, this.selectedCategory, null);
    }
    await interaction.editReply({ embeds: [this.buildEmbed()], components: this.getComponents() });
  }

  async handleClearAll(interaction: ButtonInteraction) {
    await interaction.deferUpdate();
    // Clear all guild channels
    guildRepository.updateNotifyChannel(this.guild.id, 'clan', null);
    guildRepository.updateNotifyChannel(this.guild.id, 'tournament', null);
    guildRepository.updateNotifyChannel(this.guild.id, 'twitch', null);
    guildRepository.updateNotifyChannel(this.guild.id, 'youtube', null);
    guildRepository.updateNotifyChannel(this.guild.id, 'tournament_events', null);
    guildRepository.updateNotifyChannel(this.guild.id, 'moddb', null);
    guildRepository.updateNotifyChannel(this.guild.id, 'lobby', null);
    await this.deleteStatsPanelMessage();
    statsPanelRepository.delete(this.guild.id);
    await interaction.editReply({ embeds: [this.buildEmbed()], components: this.getComponents() });
  }
}
