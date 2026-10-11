import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { RA3Bot } from '../../bot';
import { requireModeratorInteraction } from '../../utils/admin-interaction';
import { getGameContext } from '../../utils/game-context';
import { tipManagerView } from './tips-admin.view';

export const data = new SlashCommandBuilder()
  .setName('tips_admin')
  .setDescription('Manage this server gameplay tips (staff)');
export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  if (!(await requireModeratorInteraction(interaction))) return;
  await interaction.reply({
    ...tipManagerView(
      interaction.guildId!,
      interaction.user.id,
      getGameContext(interaction.guildId).game,
    ),
    ephemeral: true,
  });
}
