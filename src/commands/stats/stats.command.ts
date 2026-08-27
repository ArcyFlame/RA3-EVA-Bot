import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { ra3StatsService } from '../../services/ra3-stats.service';
import { generateBarChart, statsChartPalettes } from '../../utils/charts';
import { StatsView } from './stats.view';
import { logger } from '../../utils/logger';
import { getGameContext } from '../../utils/game-context';

export const data = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('Show live community stats for this server game')
  .addIntegerOption((opt) =>
    opt
      .setName('matches')
      .setDescription('How many recent matches to show (2-10, default 5)')
      .setRequired(false)
      .setMinValue(2)
      .setMaxValue(10),
  );

export const guildOnly = false;

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  // Ephemeral: stats are for the person who asked. Content is identical to
  // the shared channel panel (same embed, same charts attached below).
  await interaction.deferReply({ ephemeral: true });
  const context = getGameContext(interaction.guildId);
  const stats = await ra3StatsService.fetch(context.game, context.sources);
  const view = new StatsView(stats, context.game, context.sources);
  const [online24Palette, newPlayersPalette, online30Palette] = statsChartPalettes(context.game);
  const matchCount = interaction.options.getInteger('matches');
  if (matchCount) view.setRecentMatchCount(matchCount);

  // Embed first, charts in a follow-up message BELOW it (attachments would
  // render above the embed inside a single message).
  await interaction.editReply({
    embeds: [view.getEmbed()],
    components: view.getComponents(),
  });

  const files: Array<{ attachment: Buffer; name: string }> = [];
  if (context.sources.cncOnline || context.sources.ra3BattleNet)
    try {
      files.push({
        attachment: await generateBarChart(
          stats.online_last_24h,
          'Online Players (Last 24 Hours)',
          online24Palette,
          context.game,
        ),
        name: 'online_players_last_24_hours.png',
      });
    } catch (err) {
      logger.error('24h bar chart failed:', err);
    }
  if (
    (context.game === 'ra3' && context.sources.ra3BattleNet) ||
    (context.game === 'genevo' && (context.sources.cncOnline || context.sources.ra3BattleNet))
  )
    try {
      files.push({
        attachment: await generateBarChart(
          stats.new_players_last_30d,
          'New Players (Last 30 Days)',
          newPlayersPalette,
          context.game,
        ),
        name: 'new_players_last_30_days.png',
      });
    } catch (err) {
      logger.error('30d new players chart failed:', err);
    }
  if (context.sources.cncOnline || context.sources.ra3BattleNet)
    try {
      files.push({
        attachment: await generateBarChart(
          stats.online_last_30d,
          'Online Players (Last 30 Days)',
          online30Palette,
          context.game,
        ),
        name: 'online_players_last_30_days.png',
      });
    } catch (err) {
      logger.error('30d online chart failed:', err);
    }
  // One chart per message, below the embed — grouped image attachments get
  // cropped into a gallery, which looked bad.
  for (const file of files) {
    await interaction.followUp({ files: [file], ephemeral: true });
  }
}
