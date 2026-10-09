import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { RA3Bot } from '../../bot';
import { masterRepository } from '../../repositories/master.repository';
import { denyUnlessAdmin } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';
import { buildMastersEmbed } from '../info/masters.view';
import { getGameContext } from '../../utils/game-context';

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

  const context = getGameContext(interaction.guildId);
  if (!context.mastersEnabled) {
    await interaction.reply({ content: 'Enable Masters in /toggle first.', ephemeral: true });
    return;
  }
  const masters = masterRepository.getAll(context.game);
  if (masters.length === 0) {
    await interaction.reply({ content: 'No masters in Hall of Fame.', ephemeral: true });
    return;
  }

  await interaction.reply({ embeds: [buildMastersEmbed(masters, context.game)], ephemeral: true });
}
