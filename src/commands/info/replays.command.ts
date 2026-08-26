import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { getGameContext } from '../../utils/game-context';

export const data = new SlashCommandBuilder()
  .setName('replays')
  .setDescription('Browse replay resources for this server game');

export const guildOnly = false;

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  const context = getGameContext(interaction.guildId);
  if (context.game === 'genevo') {
    const embed = new EmbedBuilder()
      .setTitle('🎮 Generals Evolution Replays')
      .setDescription(
        'Generals Evolution does not have a dedicated GameReplays replay index. Check the official project page and current tournament posts for replay packs.',
      )
      .setColor(context.config.color)
      .setThumbnail(context.config.artworkUrl);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel('Official GenEvo Page')
        .setStyle(ButtonStyle.Link)
        .setURL(context.config.tournamentFallbackUrl),
    );
    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
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
