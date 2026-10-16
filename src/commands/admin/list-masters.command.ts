import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { RA3Bot } from '../../bot';
import { denyUnlessAdmin } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';
import { mastersView } from '../info/masters-manager.view';
import { getGameContext } from '../../utils/game-context';

export const data = new SlashCommandBuilder()
  .setName('list_masters')
  .setDescription('[Admin] List all Hall of Fame experts')
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
    await interaction.reply({ content: 'Enable Experts in /toggle first.', ephemeral: true });
    return;
  }
  await interaction.reply({
    ...mastersView(interaction.guildId, interaction.user.id, context.game, true),
    ephemeral: true,
  });
}
