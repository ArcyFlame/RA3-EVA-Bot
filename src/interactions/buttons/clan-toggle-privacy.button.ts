import { ButtonInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { clanRepository } from '../../repositories/clan.repository';
import { parseCustomIdInt } from '../../utils/parse';

export const customIdPrefix = 'clan_toggle_privacy_';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  const clanId = parseCustomIdInt(interaction.customId, 3);
  if (clanId === null) {
    await interaction.reply({ content: 'Invalid clan.', ephemeral: true });
    return;
  }
  const clan = clanRepository.findById(clanId);
  if (!clan || clan.ownerId !== interaction.user.id) {
    await interaction.reply({ content: 'You are not the leader of this clan.', ephemeral: true });
    return;
  }
  const newPrivacy = !clan.isPrivate;
  clanRepository.togglePrivacy(clanId, newPrivacy);
  await interaction.reply({
    content: `✅ Clan is now ${newPrivacy ? 'private' : 'public'}.`,
    ephemeral: true,
  });
}
