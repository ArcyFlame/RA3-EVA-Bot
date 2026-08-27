import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { moddbNotifier } from '../../services/moddb-notifier.service';
import { MODDB } from '../../utils/emojis';
import { logger } from '../../utils/logger';
import { getGameContext } from '../../utils/game-context';

export const data = new SlashCommandBuilder()
  .setName('mods')
  .setDescription('Newest ModDB updates for this server game')
  .addIntegerOption((opt) =>
    opt
      .setName('limit')
      .setDescription('How many entries to show (1-10, default 8)')
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(10),
  );

export const guildOnly = false;

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const limit = interaction.options.getInteger('limit') ?? 8;
  const context = getGameContext(interaction.guildId);

  try {
    const items = await moddbNotifier.fetchLatestItems(context.game, limit);
    if (items.length === 0) {
      await interaction.editReply('Could not fetch ModDB right now - try again in a minute.');
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`${MODDB} Latest ${context.config.shortLabel} Updates on ModDB`)
      .setColor(context.config.color)
      .setThumbnail(context.config.artworkUrl)
      .setAuthor({ name: 'ModDB', iconURL: 'https://www.moddb.com/favicon.ico' })
      .setDescription(
        items
          .map((item) => {
            const date = new Date(item.pubDate);
            const dateText = isNaN(date.getTime())
              ? ''
              : ` - <t:${Math.floor(date.getTime() / 1000)}:D>`;
            return `• [${item.title}](${item.link})${dateText}`;
          })
          .join('\n')
          .slice(0, 4000),
      )
      .setFooter({ text: `Source: ModDB ${context.config.shortLabel} • newest first` })
      .setTimestamp();
    if (items[0].imageUrl) embed.setImage(items[0].imageUrl);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel('All Articles')
        .setStyle(ButtonStyle.Link)
        .setURL(context.config.moddbArticlesUrl),
      new ButtonBuilder()
        .setLabel(context.game === 'ra3' ? 'All RA3 Mods' : 'Downloads & Addons')
        .setStyle(ButtonStyle.Link)
        .setURL(context.config.moddbModsUrl),
    );
    await interaction.editReply({ embeds: [embed], components: [row] });
  } catch (error) {
    logger.error('mods: failed to fetch ModDB items:', error);
    await interaction.editReply('Could not fetch ModDB right now - try again in a minute.');
  }
}
