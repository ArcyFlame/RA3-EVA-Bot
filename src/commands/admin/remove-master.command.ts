import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { RA3Bot } from '../../bot';
import { masterRepository } from '../../repositories/master.repository';
import { denyUnlessAdmin } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';
import { sanitizeInput } from '../../utils/sanitize';

export const data = new SlashCommandBuilder()
  .setName('remove_master')
  .setDescription('[Admin] Remove a master from the Hall of Fame')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((option) =>
    option.setName('name').setDescription('Player name').setRequired(true),
  );

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  const member = await resolveMember(interaction);
  const denial = denyUnlessAdmin(member);
  if (denial) {
    await interaction.reply({ content: denial, ephemeral: true });
    return;
  }

  const name = sanitizeInput(interaction.options.getString('name', true).trim(), 50);
  if (masterRepository.deleteByName(name)) {
    await interaction.reply({
      content: `✅ **${name}** removed from Hall of Fame.`,
      ephemeral: true,
    });
  } else {
    await interaction.reply({ content: `❌ Master **${name}** not found.`, ephemeral: true });
  }
}
