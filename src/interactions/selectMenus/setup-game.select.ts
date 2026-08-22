import { StringSelectMenuInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { guildRepository } from '../../repositories/guild.repository';
import { GAME_OPTIONS } from '../../commands/setup/setup-wizard.command';

/**
 * Game selector in /bot_setup: `setup_game_select`. Switching the game
 * changes platform usage (RA3BattleNet is RA3-only), news feed and help
 * category defaults.
 */
export const customId = 'setup_game_select';

export async function execute(_bot: RA3Bot, interaction: StringSelectMenuInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Server only.', ephemeral: true });
    return;
  }
  const value = interaction.values[0];
  if (!GAME_OPTIONS.some((g) => g.value === value)) {
    await interaction.reply({ content: 'Unknown game.', ephemeral: true });
    return;
  }
  guildRepository.setGame(interaction.guild.id, value as 'ra3' | 'kw' | 'genevo');
  const label = GAME_OPTIONS.find((g) => g.value === value)?.label ?? value;
  await interaction.reply({
    content: `✅ Server game set to **${label}**. News, platform scans and help adapt automatically.`,
    ephemeral: true,
  });
}
