import { ButtonInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { testConfiguredChannels } from '../../utils/channel-test';
import { requireAdminInteraction } from '../../utils/admin-interaction';

export const customId = 'notif_test';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  if (!interaction.guild) return;
  await interaction.deferReply({ ephemeral: true });
  if (!(await requireAdminInteraction(interaction))) return;
  await interaction.editReply({ embeds: [await testConfiguredChannels(interaction.guild)] });
}
