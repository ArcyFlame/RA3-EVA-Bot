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
import { replayLibraryAccess, replayLibraryView } from '../replays/replay-library.view';

export const data = new SlashCommandBuilder()
  .setName('replays')
  .setDescription('Browse replay resources for this server game');

export const guildOnly = false;

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  const context = getGameContext(interaction.guildId);
  if (context.game === 'genevo') {
    await interaction.deferReply({ ephemeral: true });
    const access = await replayLibraryAccess(interaction);
    await interaction.editReply(
      access
        ? replayLibraryView(access)
        : {
            content:
              'No accessible replay channel is selected. An admin can select one in /notifications.',
            components: [],
            allowedMentions: { parse: [] },
          },
    );
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
