import { ButtonInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { buildFeatureToggleView } from '../../commands/setup/feature-toggle.view';
import { guildRepository } from '../../repositories/guild.repository';
import { denyUnlessAdmin, isOwner } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';

export const customId = 'setup_features';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'This menu can only be used inside a server.', ephemeral: true });
    return;
  }
  const denial = denyUnlessAdmin(await resolveMember(interaction));
  if (denial) {
    await interaction.reply({ content: denial, ephemeral: true });
    return;
  }
  guildRepository.upsert(interaction.guild.id, {});
  await interaction.reply({
    ...buildFeatureToggleView(interaction.guild.id, 'clans', isOwner(interaction.user.id)),
    ephemeral: true,
  });
}
