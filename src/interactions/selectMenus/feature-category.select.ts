import { StringSelectMenuInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { buildFeatureToggleView, isFeatureKey } from '../../commands/setup/feature-toggle.view';
import { isOwner } from '../../utils/permissions';
import { requireAdminInteraction } from '../../utils/admin-interaction';

export const customId = 'feature_category';

export async function execute(_bot: RA3Bot, interaction: StringSelectMenuInteraction) {
  if (!interaction.guild) return;
  if (!(await requireAdminInteraction(interaction))) return;
  const selected = interaction.values[0];
  if (
    !isFeatureKey(selected) ||
    (selected === 'dmPublicCommands' && !isOwner(interaction.user.id))
  ) {
    await interaction.reply({ content: 'Unknown feature category.', ephemeral: true });
    return;
  }
  await interaction.update(
    buildFeatureToggleView(interaction.guild.id, selected, isOwner(interaction.user.id)),
  );
}
