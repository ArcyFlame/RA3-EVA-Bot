import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { RA3Bot } from '../../bot';
import { denyUnlessOwner } from '../../utils/permissions';
import { audit, logger } from '../../utils/logger';

export const data = new SlashCommandBuilder()
  .setName('kill')
  .setDescription('[Owner] Shut down the bot')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  const denial = denyUnlessOwner(interaction.user.id);
  if (denial) {
    await interaction.reply({ content: denial, ephemeral: true });
    return;
  }

  audit('kill', { user: interaction.user.id, guild: interaction.guildId });
  await interaction.reply({ content: '💀 Shutting down...', ephemeral: true });

  // Graceful stop on the next tick so the reply can flush first.
  const timer = setTimeout(() => {
    bot
      .stop()
      .catch((error) => logger.error('Error during kill shutdown:', error))
      .finally(() => process.exit(0));
  }, 1500);
  timer.unref();
}
