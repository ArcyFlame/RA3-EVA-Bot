import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { openBotProfile } from './bot-profile.view';
export const data = new SlashCommandBuilder()
  .setName('bot_profile')
  .setDescription('Edit this server bot profile')
  .setDefaultMemberPermissions(null);
export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  await openBotProfile(interaction);
}
