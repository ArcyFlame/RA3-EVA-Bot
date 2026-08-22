import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';

export const data = new SlashCommandBuilder().setName('ping').setDescription('Replies with Pong!');

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  await interaction.reply({ content: 'Pong!', ephemeral: true });
}
