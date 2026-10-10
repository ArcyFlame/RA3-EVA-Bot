import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { openApi } from './api.view';
export const data = new SlashCommandBuilder()
  .setName('api')
  .setDescription('Service connection status and bot-owner credential settings')
  .setDefaultMemberPermissions(null);
export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  await openApi(interaction);
}
