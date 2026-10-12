import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { getGameContext } from '../../utils/game-context';
import { tipRepository } from '../../repositories/tip.repository';
import { tipCard } from './tips.view';
import { tipSettingsRepository } from '../../repositories/tip-settings.repository';

export const data = new SlashCommandBuilder()
  .setName('tips')
  .setDescription('Show a gameplay tip and its sources');
export const guildOnly = false;
export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  const settings = tipSettingsRepository.get(interaction.guildId);
  if (!settings.enabled) {
    await interaction.reply({
      content: 'Tips are disabled in this server.',
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    return;
  }
  const { game } = getGameContext(interaction.guildId);
  const tips = tipRepository.list(interaction.guildId, game);
  const tip = tips[Math.floor(Math.random() * tips.length)];
  await interaction.reply(
    tip
      ? {
          ...tipCard(tip, tipRepository.displayNumber(interaction.guildId, game, tip.id)),
          ephemeral: !interaction.guildId || settings.visibility === 'private',
        }
      : {
          content: 'No tips are enabled for this game.',
          allowedMentions: { parse: [] },
          ephemeral: true,
        },
  );
}
