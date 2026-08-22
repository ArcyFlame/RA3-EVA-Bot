import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { ra3StatsService } from '../../services/ra3-stats.service';
import { guildRepository } from '../../repositories/guild.repository';
import { generateBarChart } from '../../utils/charts';
import { StatsView } from './stats.view';
import { logger } from '../../utils/logger';

export const data = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('Show live RA3 community stats with interactive pages')
  .addIntegerOption((opt) =>
    opt
      .setName('matches')
      .setDescription('How many recent matches to show (2-10, default 5)')
      .setRequired(false)
      .setMinValue(2)
      .setMaxValue(10),
  );

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  // Ephemeral: stats are for the person who asked. Content is identical to
  // the shared channel panel (same embed, same charts attached below).
  await interaction.deferReply({ ephemeral: true });
  const stats = await ra3StatsService.fetch();
  const view = new StatsView(stats);
  const matchCount = interaction.options.getInteger('matches');
  if (matchCount) view.setRecentMatchCount(matchCount);
  // KW/GenEvo servers hide the RA3BattleNet sections (C&C Online only).
  let showRa3b = true;
  if (interaction.guildId) {
    const guildData = guildRepository.findByDiscordId(interaction.guildId);
    showRa3b = (guildData?.game ?? 'ra3') === 'ra3';
    view.setShowRa3b(showRa3b);
  }

  // Embed first, charts in a follow-up message BELOW it (attachments would
  // render above the embed inside a single message).
  await interaction.editReply({
    embeds: [view.getEmbed()],
    components: view.getComponents(),
  });

  const files: Array<{ attachment: Buffer; name: string }> = [];
  try {
    files.push({
      attachment: await generateBarChart(stats.online_last_24h, 'Online Players (Last 24 Hours)', 'Reds_r'),
      name: 'online_players_last_24_hours.png',
    });
  } catch (err) {
    logger.error('24h bar chart failed:', err);
  }
  try {
    files.push({
      attachment: await generateBarChart(stats.new_players_last_30d, 'New Players (Last 30 Days)', 'Blues_r'),
      name: 'new_players_last_30_days.png',
    });
  } catch (err) {
    logger.error('30d new players chart failed:', err);
  }
  try {
    files.push({
      attachment: await generateBarChart(stats.online_last_30d, 'Online Players (Last 30 Days)', 'YlOrBr_r'),
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
