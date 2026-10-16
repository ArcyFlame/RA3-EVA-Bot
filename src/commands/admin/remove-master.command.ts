import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { RA3Bot } from '../../bot';
import { masterRepository } from '../../repositories/master.repository';
import { denyUnlessOwner } from '../../utils/permissions';
import { sanitizeInput } from '../../utils/sanitize';
import { getGameContext } from '../../utils/game-context';

export const data = new SlashCommandBuilder()
  .setName('remove_master')
  .setDescription('[Owner] Remove an expert from the shared Hall of Fame')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((option) =>
    option.setName('name').setDescription('Player name').setRequired(true),
  );

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  const denial = denyUnlessOwner(interaction.user.id);
  if (denial) {
    await interaction.reply({ content: denial, ephemeral: true });
    return;
  }

  const name = sanitizeInput(interaction.options.getString('name', true).trim(), 50);
  const context = getGameContext(interaction.guildId);
  if (!context.mastersEnabled) {
    await interaction.reply({ content: 'Enable Experts in /toggle first.', ephemeral: true });
    return;
  }
  if (masterRepository.deleteByName(name, context.game)) {
    await interaction.reply({
      content: `✅ **${name}** removed from Hall of Fame.`,
      ephemeral: true,
    });
  } else {
    await interaction.reply({ content: `❌ Expert **${name}** not found.`, ephemeral: true });
  }
}
