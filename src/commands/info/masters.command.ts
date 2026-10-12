import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { mastersView } from './masters-manager.view';
import { isModerator } from '../../utils/permissions';
import { getGameContext } from '../../utils/game-context';

export const data = new SlashCommandBuilder()
  .setName('masters')
  .setDescription('Show the Hall of Fame (all-time masters)');

export const guildOnly = false;

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const context = getGameContext(interaction.guildId);
  if (!context.mastersEnabled) {
    await interaction.editReply('Masters are disabled on this server.');
    return;
  }
  const member = interaction.guild
    ? await interaction.guild.members
        .fetch({ user: interaction.user.id, force: true })
        .catch(() => null)
    : null;
  await interaction.editReply(
    mastersView(
      interaction.guildId,
      interaction.user.id,
      context.game,
      !!member && isModerator(member),
    ),
  );
}
