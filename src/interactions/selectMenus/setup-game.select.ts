import { StringSelectMenuInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { guildRepository } from '../../repositories/guild.repository';
import { GAME_OPTIONS } from '../../commands/setup/setup-wizard.command';
import { GameId } from '../../config/games';

/**
 * Game selector in /bot_setup: `setup_game_select`. Switching the game
 * changes the news feed, maps, statistics and help category defaults.
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
  if (!guildRepository.findByDiscordId(interaction.guild.id)) {
    guildRepository.upsert(interaction.guild.id, {});
  }
  guildRepository.setGame(interaction.guild.id, value as GameId);
  const label = GAME_OPTIONS.find((g) => g.value === value)?.label ?? value;
  await interaction.reply({
    content:
      `✅ Server game set to **${label}**. News, maps, tournaments, tips and live data now use this game.\n` +
      `Platforms: **C&C Online enabled**, **RA3BattleNet enabled**.`,
    ephemeral: true,
  });
}
