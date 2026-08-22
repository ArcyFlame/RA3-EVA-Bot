import { ButtonInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { testConfiguredChannels } from '../../utils/channel-test';
import { denyUnlessAdmin } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';

export const customId = 'notif_test';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  if (!interaction.guild) return;
  const denial = denyUnlessAdmin(await resolveMember(interaction));
  if (denial) {
    await interaction.reply({ content: denial, ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  await interaction.editReply({ embeds: [await testConfiguredChannels(interaction.guild)] });
}
