import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { RA3Bot } from '../../bot';
import { denyUnlessOwner } from '../../utils/permissions';
import { audit, logger } from '../../utils/logger';

export const data = new SlashCommandBuilder()
  .setName('restart')
  .setDescription('[Owner] Restart the bot (requires a process supervisor to bring it back)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  const denial = denyUnlessOwner(interaction.user.id);
  if (denial) {
    await interaction.reply({ content: denial, ephemeral: true });
    return;
  }

  audit('restart', { user: interaction.user.id, guild: interaction.guildId });
  await interaction.reply({ content: '🔄 Restarting bot...', ephemeral: true });

  // Exit code 0 + a supervisor (systemd/docker/pm2) performs the actual restart.
  const timer = setTimeout(() => {
    bot
      .stop()
      .catch((error) => logger.error('Error during restart shutdown:', error))
      .finally(() => process.exit(0));
  }, 1500);
  timer.unref();
}
