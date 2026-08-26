import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { newsRepository, NewsItem } from '../../repositories/news.repository';
import { getGameContext } from '../../utils/game-context';
import { GAME_CONFIGS } from '../../config/games';

export const data = new SlashCommandBuilder()
  .setName('news')
  .setDescription('Browse the latest news for this server game')
  .addIntegerOption((opt) =>
    opt
      .setName('limit')
      .setDescription('How many news items to browse (2-25)')
      .setRequired(false)
      .setMinValue(2)
      .setMaxValue(25),
  );

export const guildOnly = false;

/** Shared renderer used by /news and the newspg_* navigation buttons. */
export function renderNewsPage(
  item: NewsItem,
  total: number,
  index: number,
): { embeds: [EmbedBuilder]; components: [ActionRowBuilder<ButtonBuilder>] } {
  const embed = new EmbedBuilder()
    .setTitle(`📰 ${item.title}`)
    .setURL(item.newsUrl)
    .setColor(GAME_CONFIGS[item.game].color)
    .setThumbnail(GAME_CONFIGS[item.game].artworkUrl)
    .setDescription(
      item.excerpt?.slice(0, 300) ||
        `${GAME_CONFIGS[item.game].shortLabel} news from the community.`,
    )
    .setFooter({ text: `${GAME_CONFIGS[item.game].shortLabel} News • ${index + 1}/${total}` });

  // Wrap-around navigation: prev on the newest loops to the oldest.
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`newspg_prev_${item.id}`)
      .setLabel('◀ Previous')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setLabel('Open').setStyle(ButtonStyle.Link).setURL(item.newsUrl),
    new ButtonBuilder()
      .setCustomId(`newspg_next_${item.id}`)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row] };
}

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const limit = interaction.options.getInteger('limit') ?? 20;
  const items = newsRepository.getLatest(limit, getGameContext(interaction.guildId).game);
  if (items.length === 0) {
    await interaction.editReply({
      content: 'No news stored yet - the scanner fills this in automatically. Try again shortly.',
    });
    return;
  }
  await interaction.editReply(renderNewsPage(items[0], items.length, 0));
}
