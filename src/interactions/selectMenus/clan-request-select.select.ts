import {
  StringSelectMenuInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { clanRepository } from '../../repositories/clan.repository';
import { parseIntSafe } from '../../utils/parse';

export const customIdPrefix = 'clan_request_select_';

export async function execute(_bot: RA3Bot, interaction: StringSelectMenuInteraction) {
  const requestId = parseIntSafe(interaction.values[0]);
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
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`clan_accept_request_${requestId}`)
      .setLabel('Accept')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`clan_reject_request_${requestId}`)
      .setLabel('Reject')
      .setStyle(ButtonStyle.Danger),
  );
  await interaction.reply({
    content: `Request from <@${req.userId}>: ${req.message || 'No message'}`,
    components: [row],
    ephemeral: true,
  });
}
