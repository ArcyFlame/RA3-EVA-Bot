import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { openApi } from './api.view';
export const data = new SlashCommandBuilder()
  .setName('api')
  .setDescription('View service status (shared keys: bot owner only)')
  .setDefaultMemberPermissions(null);
export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  await openApi(interaction);
}
