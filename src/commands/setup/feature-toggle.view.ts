import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { appSettingsRepository } from '../../repositories/app-settings.repository';
import { Guild, guildRepository } from '../../repositories/guild.repository';

export type FeatureKey =
  | 'clans'
  | 'tournaments'
  | 'profiles'
  | 'twitchNotifier'
  | 'youtubeNotifier'
  | 'moddbNotifier'
  | 'moderation'
  | 'lobby'
  | 'statsAutoUpdate'
  | 'welcome'
  | 'news'
  | 'menusMode'
  | 'dmPublicCommands';

interface FeatureDefinition {
  key: FeatureKey;
  label: string;
  emoji: string;
  description: string;
  enabled: (guild: Guild) => boolean;
}

export const FEATURE_DEFINITIONS: FeatureDefinition[] = [
  { key: 'clans', label: 'Clans', emoji: '👥', description: 'Clan creation and management', enabled: (g) => g.clansEnabled === 1 },
  { key: 'tournaments', label: 'Tournaments', emoji: '🏆', description: 'Tournament browsing and tools', enabled: (g) => g.tournamentsEnabled === 1 },
  { key: 'profiles', label: 'Profiles', emoji: '👤', description: 'Linked player profiles and ranks', enabled: (g) => g.profilesEnabled === 1 },
  { key: 'twitchNotifier', label: 'Twitch notifier', emoji: '📺', description: 'Twitch live announcements', enabled: (g) => g.twitchNotifierEnabled === 1 },
  { key: 'youtubeNotifier', label: 'YouTube notifier', emoji: '🎬', description: 'YouTube video announcements', enabled: (g) => g.youtubeNotifierEnabled === 1 },
  { key: 'moddbNotifier', label: 'ModDB updates', emoji: '📦', description: 'Recent RA3 ModDB posts', enabled: (g) => g.moddbNotifierEnabled === 1 },
  { key: 'moderation', label: 'Moderation', emoji: '🔨', description: 'Moderation commands', enabled: (g) => g.moderationEnabled === 1 },
  { key: 'lobby', label: 'Lobby tracker', emoji: '🎮', description: 'Online lobby tracking', enabled: (g) => g.lobbyEnabled === 1 },
  { key: 'statsAutoUpdate', label: 'Stats auto-update', emoji: '📊', description: 'Scheduled stats panels', enabled: (g) => g.statsAutoUpdateEnabled === 1 },
  { key: 'welcome', label: 'Welcome messages', emoji: '👋', description: 'Messages for new server members', enabled: (g) => g.welcomeEnabled === 1 },
  { key: 'news', label: 'RA3 news', emoji: '📰', description: 'GameReplays news announcements', enabled: (g) => g.newsEnabled === 1 },
  { key: 'menusMode', label: 'Interactive menus', emoji: '🎛️', description: 'Use buttons and menus where available', enabled: (g) => g.menusEnabled === 1 },
  { key: 'dmPublicCommands', label: 'Public commands in DMs', emoji: '✉️', description: 'Allow safe public commands in bot DMs', enabled: () => appSettingsRepository.isDmPublicCommandsEnabled() },
];

const GUILD_FEATURE_KEYS = new Set<FeatureKey>([
  'clans',
  'tournaments',
  'profiles',
  'twitchNotifier',
  'youtubeNotifier',
  'moddbNotifier',
  'moderation',
  'lobby',
  'statsAutoUpdate',
  'welcome',
  'news',
]);

export function isFeatureKey(value: string): value is FeatureKey {
  return FEATURE_DEFINITIONS.some((feature) => feature.key === value);
}

export function setFeatureState(guildId: string, key: FeatureKey, enabled: boolean): void {
  if (key === 'menusMode') {
    guildRepository.setMenusEnabled(guildId, enabled);
    return;
  }
  if (key === 'dmPublicCommands') {
    appSettingsRepository.setDmPublicCommandsEnabled(enabled);
    return;
  }
  if (GUILD_FEATURE_KEYS.has(key)) guildRepository.toggleFeature(guildId, key, enabled);
}

export function buildFeatureToggleView(
  guildId: string,
  selected: FeatureKey = 'clans',
  includeGlobal = false,
): {
  embeds: [EmbedBuilder];
  components: [
    ActionRowBuilder<StringSelectMenuBuilder>,
    ActionRowBuilder<ButtonBuilder>,
    ActionRowBuilder<ButtonBuilder>,
  ];
} {
  const guild = guildRepository.findByDiscordId(guildId);
  if (!guild) throw new Error('Guild settings are not initialized.');

  const available = FEATURE_DEFINITIONS.filter(
    (feature) => includeGlobal || feature.key !== 'dmPublicCommands',
  );
  const active = available.find((feature) => feature.key === selected) ?? available[0];
  const enabled = active.enabled(guild);
  const statusLines = available.map(
    (feature) => `${feature.emoji} **${feature.label}:** ${feature.enabled(guild) ? 'Enabled' : 'Disabled'}`,
  );

  const embed = new EmbedBuilder()
    .setTitle('⚙️ Feature Toggles')
    .setDescription(
      `Select a category, then press **Enable** or **Disable**.\n\n` +
        `Selected: ${active.emoji} **${active.label}** — ${active.description}\n` +
        `Current state: **${enabled ? 'Enabled' : 'Disabled'}**`,
    )
    .setColor(enabled ? 0x57f287 : 0xed4245)
    .addFields({ name: 'Current settings', value: statusLines.join('\n').slice(0, 1024) });

  const select = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('feature_category')
      .setPlaceholder('Select a feature category')
      .addOptions(
        available.map((feature) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(feature.label)
            .setDescription(feature.description)
            .setEmoji(feature.emoji)
            .setValue(feature.key)
            .setDefault(feature.key === active.key),
        ),
      ),
  );
  const actions = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`feature_set_enable_${active.key}`)
      .setLabel('Enable')
      .setStyle(ButtonStyle.Success)
      .setDisabled(enabled),
    new ButtonBuilder()
      .setCustomId(`feature_set_disable_${active.key}`)
      .setLabel('Disable')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!enabled),
  );
  const help = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('feature_help_categories')
      .setLabel('Choose Help Categories')
      .setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [select, actions, help] };
}
