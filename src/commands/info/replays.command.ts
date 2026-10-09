import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { getGameContext } from '../../utils/game-context';
import { activityRankRepository } from '../../repositories/activity-rank.repository';

export const data = new SlashCommandBuilder()
  .setName('replays')
  .setDescription('Browse replay resources for this server game');

export const guildOnly = false;

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  const context = getGameContext(interaction.guildId);
  if (context.game === 'genevo') {
    await interaction.deferReply({ ephemeral: true });
    const guild = interaction.guild;
    const channelId = guild ? activityRankRepository.getSettings(guild.id).replayChannelId : '';
    const channel = channelId ? await guild?.channels.fetch(channelId).catch(() => null) : null;
    const member = guild ? await guild.members.fetch(interaction.user.id).catch(() => null) : null;
    const accessible =
      channel &&
      channel.guildId === guild?.id &&
      channel.isTextBased() &&
      member &&
      channel.permissionsFor(member)?.has(PermissionFlagsBits.ViewChannel);
    const embed = new EmbedBuilder()
      .setTitle('🎮 Generals Evolution Replays')
      .setDescription(
        accessible
          ? `Browse and upload replays in <#${channel.id}>.`
          : 'No accessible replay channel is selected for this server. An admin can select one in `/notifications` - Notification Channels.',
      )
      .setColor(context.config.color)
      .setThumbnail(context.config.artworkUrl);
    const components = accessible
      ? [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setLabel('Open Replays Channel')
              .setStyle(ButtonStyle.Link)
              .setURL(`https://discord.com/channels/${guild!.id}/${channel.id}`),
          ),
        ]
      : [];
    await interaction.editReply({ embeds: [embed], components, allowedMentions: { parse: [] } });
    return;
  }
  const embed = new EmbedBuilder()
    .setTitle('🎮 RA3 Replays')
    .setDescription('Click the buttons below to browse replays on GameReplays.')
    .setColor(context.config.color)
    .setThumbnail(context.config.artworkUrl);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('Popular Replays')
      .setStyle(ButtonStyle.Link)
      .setURL(
        'https://www.gamereplays.org/redalert3/replays.php?game=6&tab=upcoming&show=index&tab_new=popular&display_mode=standard',
      ),
    new ButtonBuilder()
      .setLabel('Replays of the Week')
      .setStyle(ButtonStyle.Link)
      .setURL('https://www.gamereplays.org/redalert3/replays.php?game=6&show=rotw_replays'),
    new ButtonBuilder()
      .setLabel('Event Replays')
      .setStyle(ButtonStyle.Link)
      .setURL('https://www.gamereplays.org/redalert3/replays.php?game=6&show=events'),
  );
  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}
