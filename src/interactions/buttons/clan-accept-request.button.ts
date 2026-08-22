import { ButtonInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { clanRepository } from '../../repositories/clan.repository';
import { parseCustomIdInt } from '../../utils/parse';

export const customIdPrefix = 'clan_accept_request_';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Server only.', ephemeral: true }).catch(() => null);
    return;
  }
  const requestId = parseCustomIdInt(interaction.customId, 3);
  if (requestId === null) {
    await interaction.reply({ content: 'Invalid request.', ephemeral: true });
    return;
  }
  const req = clanRepository.getRequestById(requestId);
  if (!req) {
    await interaction.reply({ content: 'Request not found.', ephemeral: true });
    return;
  }
  if (req.status !== 'pending') {
    await interaction.reply({ content: 'That request has already been handled.', ephemeral: true });
    return;
  }
  const clan = clanRepository.findById(req.clanId);
  if (!clan || clan.ownerId !== interaction.user.id) {
    await interaction.reply({ content: 'Not authorized.', ephemeral: true });
    return;
  }
  if (clanRepository.findClanOfUser(req.userId, interaction.guild.id)) {
    await interaction.reply({ content: 'That user is already in another clan.', ephemeral: true });
    return;
  }
  const currentMembers = clanRepository.getMembers(clan.id);
  if (currentMembers.length >= clan.maxMembers) {
    await interaction.reply({ content: 'Clan is full.', ephemeral: true });
    return;
  }

  await interaction.deferUpdate();
  clanRepository.addMember(clan.id, req.userId);
  if (clan.roleId) {
    const member = await interaction.guild.members.fetch(req.userId).catch(() => null);
    if (member) await member.roles.add(clan.roleId).catch(() => null);
  }
  clanRepository.acceptRequest(requestId);
  await interaction.editReply({ content: `✅ <@${req.userId}> joined the clan.` });
}
