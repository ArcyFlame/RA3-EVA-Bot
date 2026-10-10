import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { requireAdminInteraction } from '../../utils/admin-interaction';
import { guildRepository } from '../../repositories/guild.repository';
import { GAME_CONFIGS, GameId } from '../../config/games';
import {
  serviceCredentials,
  SERVICE_FIELDS,
  ServiceId,
} from '../../services/service-credentials.service';

export const data = new SlashCommandBuilder()
  .setName('bot_setup')
  .setDescription('Run the server setup wizard (admin only)')
  .setDefaultMemberPermissions(null);

/** Games the bot supports; the choice switches platforms, news and help. */
export const GAME_OPTIONS = [
  {
    value: 'ra3' as GameId,
    label: GAME_CONFIGS.ra3.shortLabel,
    description: 'C&C Online and RA3BattleNet',
  },
  {
    value: 'genevo' as GameId,
    label: GAME_CONFIGS.genevo.shortLabel,
    description: 'C&C Online and RA3BattleNet',
  },
] as const;

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Server only.', ephemeral: true });
    return;
  }
  if (!(await requireAdminInteraction(interaction))) return;

  const guildData = guildRepository.findByDiscordId(interaction.guild.id);
  const game = guildData?.game ?? 'ra3';
  const gameLabel = GAME_OPTIONS.find((g) => g.value === game)?.label ?? 'Red Alert 3';

  const embed = new EmbedBuilder()
    .setTitle('🛠️ Server Setup Wizard')
    .setDescription('Click the buttons below to configure the bot for your server.')
    .setColor(GAME_CONFIGS[game].color)
    .setThumbnail(GAME_CONFIGS[game].artworkUrl)
    .addFields(
      {
        name: '1. Server Game & Roles',
        value: 'Pick this server\u2019s game, the admin role and the referee role.',
        inline: false,
      },
      {
        name: '2. Configure Notification Channels',
        value: 'Select channels for Twitch, YouTube, tournaments, news, etc.',
        inline: false,
      },
      {
        name: '3. Enable Features',
        value: 'Turn on/off clans, tournaments, profiles, notifiers, menu mode.',
        inline: false,
      },
      {
        name: '4. Service Connections',
        value:
          'Use Service Connections or /api to check optional APIs. Only the bot owner can update shared keys. Missing keys do not prevent the rest of the bot from working.',
      },
      {
        name: '5. Bot Server Profile',
        value:
          'Choose this server’s bot nickname, avatar, banner and description. Upload an image from your computer or provide a direct image URL.',
      },
      {
        name: 'Optional Services',
        value: (Object.keys(SERVICE_FIELDS) as ServiceId[])
          .map((service) => `${service}: ${serviceCredentials.status(service)}`)
          .join('\n'),
      },
      { name: '🎮 Current game', value: gameLabel, inline: false },
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('setup_admin_role')
      .setLabel('Set Admin Role')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('setup_referee_role')
      .setLabel('Set Referee Role')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('setup_notify_channels')
      .setLabel('Notification Channels')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('setup_features')
      .setLabel('Toggle Features')
      .setStyle(ButtonStyle.Success),
  );

  const gameSelect = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('setup_game_select')
      .setPlaceholder('Which game does this server play?')
      .addOptions(
        ...GAME_OPTIONS.map((g) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(g.label)
            .setValue(g.value)
            .setDescription(g.description)
            .setDefault(g.value === game),
        ),
      ),
  );

  await interaction.reply({
    embeds: [embed],
    components: [
      gameSelect,
      row,
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('setup_api')
          .setLabel('Service Connections')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('setup_profile')
          .setLabel('Bot Server Profile')
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
    ephemeral: true,
  });
}
