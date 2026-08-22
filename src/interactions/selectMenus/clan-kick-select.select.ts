import { StringSelectMenuInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { clanRepository } from '../../repositories/clan.repository';
import { parseCustomIdInt } from '../../utils/parse';

export const customIdPrefix = 'clan_kick_select_';

export async function execute(_bot: RA3Bot, interaction: StringSelectMenuInteraction) {
  if (!interaction.guild) return;
  const guild = interaction.guild;

  const clanId = parseCustomIdInt(interaction.customId, 3);
  if (clanId === null) {
    await interaction.reply({ content: 'Invalid clan.', ephemeral: true });
    return;
  }
  const clan = clanRepository.findById(clanId);
  if (!clan || clan.ownerId !== interaction.user.id) {
    await interaction.reply({ content: 'Not authorized.', ephemeral: true });
    return;
  }
  const memberId = interaction.values[0];
  if (memberId === interaction.user.id) {
    await interaction.reply({ content: 'You cannot kick yourself.', ephemeral: true });
    return;
  }
  if (!clanRepository.getMembers(clanId).includes(memberId)) {
    await interaction.reply({
      content: 'That user is not a member of this clan.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  clanRepository.removeMember(clanId, memberId);
  if (clan.roleId) {
    const member = await guild.members.fetch(memberId).catch(() => null);
    if (member) await member.roles.remove(clan.roleId).catch(() => null);
  }
  await interaction.editReply({ content: '✅ Member kicked from clan.' });
}
