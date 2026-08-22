import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { RA3Bot } from '../../bot';

export const data = new SlashCommandBuilder()
  .setName('replays')
  .setDescription('Browse RA3 replays on GameReplays');

export const guildOnly = false;

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  const embed = new EmbedBuilder()
    .setTitle('🎮 RA3 Replays')
    .setDescription('Click the buttons below to browse replays on GameReplays.')
    .setColor(0x00ae86);
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
