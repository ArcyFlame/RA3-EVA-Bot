import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { masterRepository } from '../../repositories/master.repository';
import { denyUnlessAdmin } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';
import { buildMastersEmbed } from '../info/masters.view';

export const data = new SlashCommandBuilder()
  .setName('list_masters')
  .setDescription('[Admin] List all Hall of Fame masters')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  const member = await resolveMember(interaction);
  const denial = denyUnlessAdmin(member);
  if (denial) {
    await interaction.reply({ content: denial, ephemeral: true });
    return;
  }

  const masters = masterRepository.getAll();
  if (masters.length === 0) {
    await interaction.reply({ content: 'No masters in Hall of Fame.', ephemeral: true });
    return;
  }

  await interaction.reply({ embeds: [buildMastersEmbed(masters)], ephemeral: true });
}
