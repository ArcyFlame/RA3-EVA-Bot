import {
  ButtonInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { clanRepository } from '../../repositories/clan.repository';
import { parseCustomIdInt } from '../../utils/parse';

export const customIdPrefix = 'clan_view_requests_';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Server only.', ephemeral: true }).catch(() => null);
    return;
  }
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
  const requests = clanRepository.getPendingRequests(clanId);
  if (requests.length === 0) {
    await interaction.reply({ content: 'No pending join requests.', ephemeral: true });
    return;
  }
  const options = [];
  for (const req of requests.slice(0, 25)) {
    const member = await interaction.guild.members.fetch(req.userId).catch(() => null);
    const label = member ? member.displayName : req.userId;
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(`${label} - ${req.message?.slice(0, 50) || 'No message'}`)
        .setValue(req.id.toString()),
    );
  }
  const select = new StringSelectMenuBuilder()
    .setCustomId(`clan_request_select_${clanId}`)
    .setPlaceholder('Select a request')
    .addOptions(options);
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
  await interaction.reply({
    content: 'Select a join request:',
    components: [row],
    ephemeral: true,
  });
}
