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

export const data = new SlashCommandBuilder()
  .setName('mods')
  .setDescription('Newest RA3 mod updates and articles from ModDB')
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

  try {
    const items = await moddbNotifier.fetchLatestRa3Items(limit);
    if (items.length === 0) {
      await interaction.editReply('Could not fetch ModDB right now - try again in a minute.');
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`${MODDB} Latest RA3 Articles on ModDB`)
      .setColor(0xff6600)
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
      .setFooter({ text: 'Source: ModDB RA3 Articles • newest first' })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel('All RA3 Articles')
        .setStyle(ButtonStyle.Link)
        .setURL('https://www.moddb.com/games/cc-red-alert-3/articles'),
      new ButtonBuilder()
        .setLabel('All RA3 Mods')
        .setStyle(ButtonStyle.Link)
        .setURL('https://www.moddb.com/games/cc-red-alert-3/mods'),
    );
    await interaction.editReply({ embeds: [embed], components: [row] });
  } catch (error) {
    logger.error('mods: failed to fetch ModDB items:', error);
    await interaction.editReply('Could not fetch ModDB right now - try again in a minute.');
  }
}
