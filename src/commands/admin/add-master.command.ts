import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { RA3Bot } from '../../bot';
import { masterRepository } from '../../repositories/master.repository';
import { denyUnlessAdmin } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';
import { sanitizeInput } from '../../utils/sanitize';
import { logger } from '../../utils/logger';

export const data = new SlashCommandBuilder()
  .setName('add_master')
  .setDescription('[Admin] Add a master to the Hall of Fame')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((option) =>
    option.setName('name').setDescription('Player name').setRequired(true),
  )
  .addIntegerOption((option) =>
    option.setName('year').setDescription('Year of achievement').setRequired(true),
  )
  .addStringOption((option) =>
    option.setName('patch').setDescription('Patch version (optional)').setRequired(false),
  );

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  const member = await resolveMember(interaction);
  const denial = denyUnlessAdmin(member);
  if (denial) {
    await interaction.reply({ content: denial, ephemeral: true });
    return;
  }

  const name = sanitizeInput(interaction.options.getString('name', true).trim(), 50);
  const year = interaction.options.getInteger('year', true);
  const patchRaw = interaction.options.getString('patch');
  const patch = patchRaw ? sanitizeInput(patchRaw.trim(), 50) : undefined;

  if (!name) {
    await interaction.reply({ content: '❌ Name is required.', ephemeral: true });
    return;
  }
  const currentYear = new Date().getFullYear();
  if (year < 2008 || year > currentYear) {
    await interaction.reply({
      content: `Year must be between 2008 and ${currentYear}.`,
      ephemeral: true,
    });
    return;
  }
  if (masterRepository.findByName(name)) {
    await interaction.reply({ content: '❌ Master already exists.', ephemeral: true });
    return;
  }

  try {
    masterRepository.create(name, year, patch);
    await interaction.reply({
      content: `✅ **${name}** (${year}) added to Hall of Fame.`,
      ephemeral: true,
    });
  } catch (error) {
    logger.error('add_master: failed to add master:', error);
    await interaction.reply({ content: '❌ Failed to add master.', ephemeral: true });
  }
}
