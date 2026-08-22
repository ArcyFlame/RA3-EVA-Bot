import { ButtonInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { clanRepository } from '../../repositories/clan.repository';
import { parseCustomIdInt } from '../../utils/parse';

export const customIdPrefix = 'clan_reject_request_';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
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
  // Authorization: only the clan owner (or a server admin) may reject requests.
  const clan = clanRepository.findById(req.clanId);
  if (!clan || clan.ownerId !== interaction.user.id) {
    await interaction.reply({ content: 'Not authorized.', ephemeral: true });
    return;
  }
  clanRepository.rejectRequest(requestId);
  await interaction.reply({ content: '❌ Request rejected.', ephemeral: true });
}
