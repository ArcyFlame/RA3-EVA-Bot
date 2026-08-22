import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { denyUnlessAdmin } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';
import { guildRepository } from '../../repositories/guild.repository';

export const data = new SlashCommandBuilder()
  .setName('bot_setup')
  .setDescription('Run the server setup wizard (admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

/** Games the bot supports; the choice switches platforms, news and help. */
export const GAME_OPTIONS = [
  { value: 'ra3', label: 'Red Alert 3', description: 'C&C Online + RA3BattleNet (full support)' },
  {
    value: 'kw',
    label: "Command & Conquer: Kane's Wrath",
    description: 'C&C Online + Shatabrick only',
  },
  { value: 'genevo', label: 'Generals Evolution', description: 'C&C Online + Shatabrick only' },
] as const;

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
  const game = guildData?.game ?? 'ra3';
  const gameLabel = GAME_OPTIONS.find((g) => g.value === game)?.label ?? 'Red Alert 3';

  const embed = new EmbedBuilder()
    .setTitle('🛠️ Server Setup Wizard')
    .setDescription('Click the buttons below to configure the bot for your server.')
    .setColor(0x5865f2)
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
    components: [gameSelect, row],
    ephemeral: true,
  });
}
