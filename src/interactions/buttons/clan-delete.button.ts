import { ButtonInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { RA3Bot } from '../../bot';
import { clanRepository } from '../../repositories/clan.repository';
import { parseCustomIdInt } from '../../utils/parse';

export const customIdPrefix = 'clan_delete_';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  const clanId = parseCustomIdInt(interaction.customId, 2);
  if (clanId === null) {
    await interaction.reply({ content: 'Invalid clan.', ephemeral: true });
    return;
  }
  const clan = clanRepository.findById(clanId);
  if (!clan || clan.ownerId !== interaction.user.id) {
    await interaction.reply({ content: 'You are not the leader of this clan.', ephemeral: true });
    return;
  }
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`clan_confirm_delete_${clanId}`)
      .setLabel('Yes, Delete')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`clan_cancel_delete_${clanId}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
  );
  await interaction.reply({
    content: '⚠️ Are you sure? This will delete the clan role, channels, and all members.',
    components: [row],
    ephemeral: true,
  });
}
