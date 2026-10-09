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
  ChannelSelectMenuInteraction,
  Client,
} from 'discord.js';
import { guildRepository } from '../../repositories/guild.repository';
import { statsPanelRepository } from '../../repositories/stats-panel.repository';
import { logger } from '../../utils/logger';
import { Language } from '../../repositories/user.repository';
import { t } from '../../utils/i18n';
import { requireAdminInteraction } from '../../utils/admin-interaction';
import { postRecentIfChannelEmpty } from '../../services/content-bootstrap.service';
import { activityRankRepository } from '../../repositories/activity-rank.repository';

/** Live wizard sessions keyed by the message id currently hosting the wizard UI. */
export const wizardViews = new Map<string, GuildChannelsWizardView>();

export class NotificationsMainView {
  constructor(
    private isAdmin: boolean,
    private lang: Language = 'en',
  ) {}

  buildEmbed(): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle(t(this.lang, 'notifications.title'))
      .setColor(0x5865f2);
    if (this.isAdmin) {
      embed.setDescription(t(this.lang, 'notifications.description')).addFields(
        {
          name: t(this.lang, 'notifications.tracked'),
          value: t(this.lang, 'notifications.trackedHint'),
          inline: false,
        },
        {
          name: t(this.lang, 'notifications.channels'),
          value: t(this.lang, 'notifications.channelsHint'),
          inline: false,
        },
        {
          name: t(this.lang, 'notifications.test'),
          value: t(this.lang, 'notifications.testHint'),
          inline: false,
        },
        {
          name: t(this.lang, 'personal.title'),
          value: t(this.lang, 'personal.description'),
          inline: false,
        },
      );
    } else {
      embed.setDescription(t(this.lang, 'notifications.personalOnly')).addFields({
        name: t(this.lang, 'personal.title'),
        value: t(this.lang, 'personal.description'),
        inline: false,
      });
    }
    return embed.setFooter({ text: t(this.lang, 'notifications.footer') });
  }

  getComponents(): ActionRowBuilder<ButtonBuilder>[] {
    const row = new ActionRowBuilder<ButtonBuilder>();
    if (this.isAdmin) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('tracked_streamers')
          .setLabel(t(this.lang, 'notifications.tracked').replace(/^\S+\s/, ''))
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('global_channels')
          .setLabel(t(this.lang, 'notifications.channels').replace(/^\S+\s/, ''))
          .setStyle(ButtonStyle.Secondary),
      );
    }
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('personal_dm')
        .setLabel(t(this.lang, 'personal.title').replace(/^\S+\s/, ''))
        .setStyle(ButtonStyle.Success),
    );
    if (this.isAdmin) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('notif_test')
          .setLabel(t(this.lang, 'notifications.test').replace(/^\S+\s/, ''))
          .setStyle(ButtonStyle.Primary),
      );
    }
    return [row];
  }
}

export class GuildChannelsWizardView {
  private readonly expiresAt = Date.now() + 10 * 60 * 1000;
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
    { label: 'Game News', value: 'news', emoji: '📰' },
    { label: 'Replay Uploads', value: 'replays', emoji: '📁' },
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
      { name: '📰 Game News', value: getChannel(guildData?.newsChannelId), inline: true },
      {
        name: '📁 Replay Uploads',
        value: getChannel(activityRankRepository.getSettings(this.guild.id).replayChannelId),
        inline: true,
      },
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
  private async deleteStatsPanelMessage(interaction: ButtonInteraction): Promise<boolean> {
    const panel = statsPanelRepository.get(this.guild.id);
    if (!panel?.channelId || !panel.messageId) return true;
    const channel = await this.guild.channels.fetch(panel.channelId).catch(() => null);
    if (!(await this.authorize(interaction))) return false;
    if (channel?.isTextBased()) {
      await channel.messages.delete(panel.messageId).catch(() => null);
    }
    return true;
  }

  private invalidate(): void {
    for (const [id, view] of wizardViews) if (view === this) wizardViews.delete(id);
  }

  async authorize(
    interaction: ButtonInteraction | StringSelectMenuInteraction | ChannelSelectMenuInteraction,
  ): Promise<boolean> {
    const deny = async (content: string) => {
      const response = { content, ephemeral: true, allowedMentions: { parse: [] as [] } };
      if (interaction.deferred || interaction.replied) await interaction.followUp(response);
      else await interaction.reply(response);
      return false;
    };
    if (interaction.user.id !== this.ownerId || interaction.guild?.id !== this.guild.id) {
      return deny('This menu belongs to another administrator or server.');
    }
    const live = () =>
      Date.now() < this.expiresAt && wizardViews.get(interaction.message.id) === this;
    if (!live()) return deny('Session expired. Please reopen the wizard.');
    if (!(await requireAdminInteraction(interaction))) {
      this.invalidate();
      return false;
    }
    if (!live()) return deny('Session expired. Please reopen the wizard.');
    return true;
  }

  async handleSelect(interaction: StringSelectMenuInteraction) {
    const category = interaction.values[0];
    await interaction.deferUpdate();
    if (!(await this.authorize(interaction))) return;
    if (!this.categories.some((item) => item.value === category)) {
      await interaction.followUp({ content: 'Unknown notification category.', ephemeral: true });
      return;
    }
    this.selectedCategory = category;
    await interaction.editReply({ embeds: [this.buildEmbed()], components: this.getComponents() });
  }

  async handleSet(interaction: ButtonInteraction) {
    const category = this.selectedCategory;
    await interaction.deferReply({ ephemeral: true });
    if (!(await this.authorize(interaction))) return;
    const channelSelect = new ChannelSelectMenuBuilder()
      .setCustomId(`set_global_channel_${category}`)
      .setPlaceholder('Select a text channel')
      .setChannelTypes([ChannelType.GuildText]);
    const row = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelSelect);
    const reply = await interaction.editReply({
      content: `Select a channel for **${category}**:`,
      components: [row],
    });
    wizardViews.set(reply.id, this);
    setTimeout(
      () => {
        wizardViews.delete(reply.id);
      },
      Math.max(0, this.expiresAt - Date.now()),
    ).unref();
  }

  async handleChannelSet(client: Client, interaction: ChannelSelectMenuInteraction) {
    await interaction.deferUpdate();
    if (!(await this.authorize(interaction))) return;
    const category = interaction.customId.slice('set_global_channel_'.length);
    const channelId = interaction.values[0];
    if (!this.categories.some((item) => item.value === category) || !channelId) {
      await interaction.editReply({
        content: 'Invalid channel or notification category.',
        components: [],
      });
      return;
    }
    const channel = await this.guild.channels.fetch(channelId).catch(() => null);
    if (!(await this.authorize(interaction))) return;
    if (channel?.type !== ChannelType.GuildText || channel.guildId !== this.guild.id) {
      await interaction.editReply({
        content: 'Select a text channel in this server.',
        components: [],
      });
      return;
    }
    if (category === 'stats_panel') statsPanelRepository.setChannel(this.guild.id, channel.id);
    else if (category === 'replays') {
      const settings = activityRankRepository.getSettings(this.guild.id);
      activityRankRepository.updateSettings(
        this.guild.id,
        { replayChannelId: channel.id },
        settings.version,
      );
    } else guildRepository.updateNotifyChannel(this.guild.id, category, channel.id);
    const bootstrap =
      category === 'replays'
        ? null
        : await postRecentIfChannelEmpty(client, this.guild.id, category, channel.id).catch(
            () => 'unavailable' as const,
          );
    await interaction.editReply({
      content:
        `✅ **${category}** channel set to ${channel}.` +
        (bootstrap === 'posted'
          ? ' The newest available post was added because the channel was empty.'
          : ''),
      components: [],
      allowedMentions: { parse: [] },
    });
    wizardViews.delete(interaction.message.id);
  }

  async handleClear(interaction: ButtonInteraction) {
    const category = this.selectedCategory;
    await interaction.deferUpdate();
    if (!(await this.authorize(interaction))) return;
    if (category === 'stats_panel') {
      if (!(await this.deleteStatsPanelMessage(interaction))) return;
      if (!(await this.authorize(interaction))) return;
      statsPanelRepository.delete(this.guild.id);
    } else if (category === 'replays') {
      const settings = activityRankRepository.getSettings(this.guild.id);
      activityRankRepository.updateSettings(
        this.guild.id,
        { replayAutoScan: false, replayEnabled: false },
        settings.version,
      );
    } else {
      guildRepository.updateNotifyChannel(this.guild.id, category, null);
    }
    await interaction.editReply({ embeds: [this.buildEmbed()], components: this.getComponents() });
  }

  async handleClearAll(interaction: ButtonInteraction) {
    await interaction.deferUpdate();
    if (!(await this.authorize(interaction))) return;
    if (!(await this.deleteStatsPanelMessage(interaction))) return;
    if (!(await this.authorize(interaction))) return;
    for (const category of this.categories) {
      if (category.value === 'replays') {
        const settings = activityRankRepository.getSettings(this.guild.id);
        activityRankRepository.updateSettings(
          this.guild.id,
          { replayAutoScan: false, replayEnabled: false },
          settings.version,
        );
      } else if (category.value !== 'stats_panel') {
        guildRepository.updateNotifyChannel(this.guild.id, category.value, null);
      }
    }
    statsPanelRepository.delete(this.guild.id);
    await interaction.editReply({ embeds: [this.buildEmbed()], components: this.getComponents() });
  }
}
