import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { RA3Bot } from '../../bot';

let startTime = Date.now();

export function setStartTime() {
  startTime = Date.now();
}

export const data = new SlashCommandBuilder().setName('uptime').setDescription('Show bot uptime');

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  const uptimeMs = Date.now() - startTime;
  const seconds = Math.floor(uptimeMs / 1000) % 60;
  const minutes = Math.floor(uptimeMs / (1000 * 60)) % 60;
  const hours = Math.floor(uptimeMs / (1000 * 60 * 60)) % 24;
  const days = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));
  const embed = new EmbedBuilder()
    .setTitle('🕒 Bot Uptime')
    .setDescription(`${days}d ${hours}h ${minutes}m ${seconds}s`)
    .setColor(0x00ae86);
  await interaction.reply({ embeds: [embed], ephemeral: true });
}
