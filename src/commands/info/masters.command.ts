import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { masterRepository } from '../../repositories/master.repository';
import { buildMastersEmbed } from './masters.view';
import { getGameContext } from '../../utils/game-context';

export const data = new SlashCommandBuilder()
  .setName('masters')
  .setDescription('Show the Hall of Fame (all-time masters)');

export const guildOnly = false;

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const context = getGameContext(interaction.guildId);
  if (!context.mastersEnabled) {
    await interaction.editReply('Masters are disabled on this server.');
    return;
  }
  const masters = masterRepository.getAll(context.game);
  if (masters.length === 0) {
    await interaction.editReply({ content: 'No masters in Hall of Fame yet.' });
    return;
  }

  await interaction.editReply({ embeds: [buildMastersEmbed(masters, context.game)] });
}
