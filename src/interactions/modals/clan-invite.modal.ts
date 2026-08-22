import { ModalSubmitInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { clanRepository } from '../../repositories/clan.repository';
import { parseCustomIdInt } from '../../utils/parse';

export const customIdPrefix = 'clan_invite_modal_';

export async function execute(_bot: RA3Bot, interaction: ModalSubmitInteraction) {
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
  const raw = interaction.fields.getTextInputValue('user_id').trim();
  const mentionMatch = raw.match(/<@!?(\d+)>/);
  const userId = mentionMatch ? mentionMatch[1] : raw;
  if (!/^\d{17,20}$/.test(userId)) {
    await interaction.reply({ content: 'Invalid user ID or mention.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) {
    await interaction.editReply({ content: 'User not found in this server.' });
    return;
  }
  if (clanRepository.findClanOfUser(member.id, guild.id)) {
    await interaction.editReply({ content: 'That user is already in another clan.' });
    return;
  }
  const currentMembers = clanRepository.getMembers(clanId);
  if (currentMembers.includes(member.id)) {
    await interaction.editReply({ content: 'User is already in the clan.' });
    return;
  }
  if (currentMembers.length >= clan.maxMembers) {
    await interaction.editReply({ content: 'Clan is full.' });
    return;
  }
  clanRepository.addMember(clanId, member.id);
  if (clan.roleId) await member.roles.add(clan.roleId).catch(() => null);
  await interaction.editReply({
    content: `✅ ${member.displayName} invited and added to the clan.`,
  });
}
