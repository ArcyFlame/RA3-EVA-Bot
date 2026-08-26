import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { RA3Bot } from '../../bot';
import { getGameContext } from '../../utils/game-context';

export const data = new SlashCommandBuilder().setName('info').setDescription('About this bot');

export const guildOnly = false;

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  const context = getGameContext(interaction.guildId);
  const platforms =
    context.game === 'ra3'
      ? 'GameReplays, C&C Online, Shatabrick and RA3BattleNet'
      : 'C&C Online, RA3BattleNet, Shatabrick, ModDB, YouTube and Twitch';
  const embed = new EmbedBuilder()
    .setTitle('🤖 About RA3 EVA Bot')
    .setDescription(
      `This bot helps the **${context.config.label}** community ` +
        'organize matches, run tournaments and stay connected ' +
        `across ${platforms}.\n\n` +
        '**Features:**\n' +
        '• Multi-platform setup guides & lobby tracker\n' +
        '• Tournaments with Challonge integration & results\n' +
        '• Clan system with custom roles and channels\n' +
        '• Live community stats panel with charts (1v1, 2v2 and 3v3)\n' +
        '• Player profiles and ranks (Shatabrick & RA3BattleNet)\n' +
        `• Twitch, YouTube, ModDB and ${context.config.shortLabel} news\n` +
        '• Custom maps hub & esports map picker\n' +
        '• Moderation tools (kick, ban, warnings)\n\n' +
        '*"From the community, for the community."*',
    )
    .setColor(context.config.color)
    .addFields(
      { name: '🛠️ Created by', value: '<@270293736871690240> (Arcy)', inline: true },
      { name: '📅 Version', value: '4.0.0', inline: true },
    )
    .setThumbnail(context.config.artworkUrl);
  await interaction.reply({ embeds: [embed], ephemeral: true });
}
