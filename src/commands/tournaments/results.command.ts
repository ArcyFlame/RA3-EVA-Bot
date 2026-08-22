import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { guildRepository } from '../../repositories/guild.repository';
import { fetchResultsList, renderResultsPage } from './results.utils';
import { logger } from '../../utils/logger';

export const data = new SlashCommandBuilder()
  .setName('results')
  .setDescription('Browse tournament results (Challonge standings or results threads)');

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Server only.', ephemeral: true });
    return;
  }

  const guildData = guildRepository.findByDiscordId(interaction.guild.id);
  if (guildData?.tournamentsEnabled === 0) {
    await interaction.reply({ content: '❌ Tournaments are disabled on this server.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const list = await fetchResultsList(guildData?.game ?? 'ra3');
    if (list.entries.length === 0) {
      await interaction.editReply({ content: 'No tournament results found yet.' });
      return;
    }
    const rendered = await renderResultsPage(list.entries[0]);
    if (!rendered) {
      await interaction.editReply({ content: 'Could not load tournament results.' });
      return;
    }
    await interaction.editReply(rendered);
  } catch (error) {
    logger.error('results: failed to fetch results:', error);
    await interaction.editReply({ content: 'Could not load tournament results.' });
  }
}
