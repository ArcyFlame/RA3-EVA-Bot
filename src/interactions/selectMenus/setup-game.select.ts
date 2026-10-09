import { StringSelectMenuInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { guildRepository } from '../../repositories/guild.repository';
import { GAME_OPTIONS } from '../../commands/setup/setup-wizard.command';
import { GameId } from '../../config/games';
import { requireAdminInteraction } from '../../utils/admin-interaction';
import { guildBrandingService } from '../../services/guild-branding.service';

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
  if (!(await requireAdminInteraction(interaction))) return;
  const value = interaction.values[0];
  if (!GAME_OPTIONS.some((g) => g.value === value)) {
    await interaction.reply({ content: 'Unknown game.', ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  if (!guildRepository.findByDiscordId(interaction.guild.id)) {
    guildRepository.upsert(interaction.guild.id, {});
  }
  guildRepository.setGame(interaction.guild.id, value as GameId);
  const brandingApplied = await guildBrandingService.apply(interaction.guild, value as GameId);
  const label = GAME_OPTIONS.find((g) => g.value === value)?.label ?? value;
  await interaction.editReply({
    content:
      `✅ Server game set to **${label}**. News, maps, tournaments, tips and live data now use this game.\n` +
      `Platforms: **C&C Online enabled**, **RA3BattleNet enabled**.` +
      (brandingApplied
        ? value === 'genevo'
          ? '\nThe bot uses its GenEvo avatar and banner on this server.'
          : '\nThe bot keeps its default avatar and banner.'
        : '\nThe game was saved, but Discord profile artwork could not be updated. The bot will retry at startup.'),
  });
}
