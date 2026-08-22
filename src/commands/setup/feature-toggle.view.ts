import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { guildRepository } from '../../repositories/guild.repository';

export class FeatureToggleView {
  private guildId: string;

  constructor(guildId: string) {
    this.guildId = guildId;
  }

  async buildEmbed(): Promise<EmbedBuilder> {
    const guildData = guildRepository.findByDiscordId(this.guildId);
    const features = [
      { name: 'Clans', key: 'clans', enabled: guildData?.clansEnabled === 1 },
      { name: 'Tournaments', key: 'tournaments', enabled: guildData?.tournamentsEnabled === 1 },
      { name: 'Profiles', key: 'profiles', enabled: guildData?.profilesEnabled === 1 },
      {
        name: 'Twitch Notifier',
        key: 'twitchNotifier',
        enabled: guildData?.twitchNotifierEnabled === 1,
      },
      {
        name: 'YouTube Notifier',
        key: 'youtubeNotifier',
        enabled: guildData?.youtubeNotifierEnabled === 1,
      },
      {
        name: 'ModDB Updates',
        key: 'moddbNotifier',
        enabled: guildData?.moddbNotifierEnabled === 1,
      },
      {
        name: 'Moderation Commands',
        key: 'moderation',
        enabled: guildData?.moderationEnabled === 1,
      },
      { name: 'Lobby Tracker', key: 'lobby', enabled: guildData?.lobbyEnabled === 1 },
      {
        name: 'Stats Auto-Update',
        key: 'statsAutoUpdate',
        enabled: guildData?.statsAutoUpdateEnabled === 1,
      },
      { name: 'Welcome Messages', key: 'welcome', enabled: guildData?.welcomeEnabled === 1 },
      { name: 'News', key: 'news', enabled: guildData?.newsEnabled === 1 },
    ];
    const embed = new EmbedBuilder()
      .setTitle('⚙️ Feature Toggles')
      .setDescription('Click the buttons below to enable or disable features.')
      .setColor(0x5865f2);
    for (const f of features) {
      embed.addFields({
        name: f.name,
        value: f.enabled ? '✅ Enabled' : '❌ Disabled',
        inline: true,
      });
    }
    return embed;
  }

  getComponents(): ActionRowBuilder<ButtonBuilder>[] {
    const features = [
      { label: 'Clans', value: 'clans' },
      { label: 'Tournaments', value: 'tournaments' },
      { label: 'Profiles', value: 'profiles' },
      { label: 'Twitch', value: 'twitchNotifier' },
      { label: 'YouTube', value: 'youtubeNotifier' },
      { label: 'ModDB', value: 'moddbNotifier' },
      { label: 'Moderation', value: 'moderation' },
      { label: 'Lobby', value: 'lobby' },
      { label: 'Stats Auto', value: 'statsAutoUpdate' },
      { label: 'Welcome', value: 'welcome' },
      { label: 'News', value: 'news' },
    ];
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let i = 0; i < features.length; i += 5) {
      const row = new ActionRowBuilder<ButtonBuilder>();
      for (const f of features.slice(i, i + 5)) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`toggle_feature_${f.value}`)
            .setLabel(f.label)
            .setStyle(ButtonStyle.Secondary),
        );
      }
      rows.push(row);
    }
    return rows;
  }

  /** The Menu/Command-mode switch lives in its own row (it is a preference,
   *  not a feature toggle). */
  getMenusModeRow(menusEnabled: boolean): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('toggle_menus_mode')
        .setLabel(menusEnabled ? '⚡ Switch to Command Mode' : '🎛️ Switch to Menu Mode')
        .setStyle(ButtonStyle.Primary),
    );
  }
}
