import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { RA3Bot } from '../../bot';

export const data = new SlashCommandBuilder().setName('info').setDescription('About this bot');

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  const embed = new EmbedBuilder()
    .setTitle('🤖 About RA3 EVA Bot')
    .setDescription(
      'This bot helps the **Command & Conquer: Red Alert 3** community ' +
        'organize matches, run tournaments and stay connected ' +
        'across different multiplayer platforms.\n\n' +
        '**Features:**\n' +
        '• Multi-platform setup guides & lobby tracker\n' +
        '• Tournaments with Challonge integration & results\n' +
        '• Clan system with custom roles and channels\n' +
        '• Live community stats panel with charts (1v1–4v4)\n' +
        '• Player profiles and ranks (Shatabrick & RA3BattleNet)\n' +
        '• Twitch/YouTube/ModDB notifications & RA3 news\n' +
        '• Custom maps hub & esports map picker\n' +
        '• Build orders with unit emojis\n' +
        '• Moderation tools (kick, ban, warnings)\n\n' +
        '*"From the community, for the community."*',
    )
    .setColor(0xffd700)
    .addFields(
      { name: '🛠️ Created by', value: '<@270293736871690240> (Arcy)', inline: true },
      { name: '📅 Version', value: '4.0.0', inline: true },
    )
    .setThumbnail(_bot.client.user?.displayAvatarURL() || null);
  await interaction.reply({ embeds: [embed], ephemeral: true });
}
