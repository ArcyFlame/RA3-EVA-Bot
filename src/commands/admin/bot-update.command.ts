import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { RA3Bot } from '../../bot';
import { denyUnlessOwner } from '../../utils/permissions';
import { requestBotUpdate } from '../../services/bot-update.service';
import { updateView } from './bot-update.view';

export const data = new SlashCommandBuilder()
  .setName('bot_update')
  .setDescription('Check for a bot update (bot owner)');
export const cooldown = 30;

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  const denial = denyUnlessOwner(interaction.user.id);
  if (denial) {
    await interaction.reply({ content: denial, ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  const result = await requestBotUpdate('check');
  await interaction.editReply(updateView(result, interaction.guildId!, interaction.user.id));
}
