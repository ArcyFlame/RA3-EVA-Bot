import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { openBotProfile } from './bot-profile.view';
export const data = new SlashCommandBuilder()
  .setName('bot_profile')
  .setDescription('Change the bot nickname, images and description for this server')
  .setDefaultMemberPermissions(null);
export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  await openBotProfile(interaction);
}
