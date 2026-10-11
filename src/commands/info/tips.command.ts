import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { getGameContext } from '../../utils/game-context';
import { tipRepository } from '../../repositories/tip.repository';
import { tipCard } from './tips.view';
import { tipSettingsRepository } from '../../repositories/tip-settings.repository';

export const data = new SlashCommandBuilder()
  .setName('tips')
  .setDescription('Show a gameplay tip and its sources')
  .addStringOption((option) =>
    option
      .setName('visibility')
      .setDescription('Who can see this tip')
      .addChoices({ name: 'Private', value: 'private' }, { name: 'Public', value: 'public' }),
  );
export const guildOnly = false;
export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  const settings = tipSettingsRepository.get(interaction.guildId);
  const requested = interaction.options.getString('visibility');
  const visibility = requested ?? (settings.private ? 'private' : 'public');
  if (
    !settings.enabled ||
    !['private', 'public'].includes(visibility) ||
    !settings[visibility as 'private' | 'public'] ||
    (!interaction.guildId && visibility === 'public')
  ) {
    await interaction.reply({
      content: 'Tips are disabled for this visibility. Ask an admin to check /toggle.',
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
      ? { ...tipCard(tip), ephemeral: visibility === 'private' }
      : {
          content: 'No tips are enabled for this game. Staff can manage them with /admin tips.',
          allowedMentions: { parse: [] },
          ephemeral: true,
        },
  );
}
