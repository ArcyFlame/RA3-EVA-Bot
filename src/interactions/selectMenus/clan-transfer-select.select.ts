import { StringSelectMenuInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { clanRepository } from '../../repositories/clan.repository';
import { parseCustomIdInt } from '../../utils/parse';

export const customIdPrefix = 'clan_transfer_select_';

export async function execute(_bot: RA3Bot, interaction: StringSelectMenuInteraction) {
  if (!interaction.guild) return;
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
  const newLeaderId = interaction.values[0];
  // The target must actually be a member — a crafted select value could
  // otherwise orphan the clan or hand it to an outsider.
  if (!clanRepository.getMembers(clanId).includes(newLeaderId)) {
    await interaction.reply({
      content: '❌ That user is not a member of this clan.',
      ephemeral: true,
    });
    return;
  }
  clanRepository.transferOwnership(clanId, newLeaderId);
  await interaction.reply({ content: '✅ Leadership transferred.', ephemeral: true });
}
