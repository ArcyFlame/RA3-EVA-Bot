import { ButtonInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { buildFeatureToggleView, isFeatureKey, setFeatureState } from '../../commands/setup/feature-toggle.view';
import { denyUnlessAdmin, isOwner } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';

export const customIdPrefix = 'feature_set_';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  if (!interaction.guild) return;
  const denial = denyUnlessAdmin(await resolveMember(interaction));
  if (denial) {
    await interaction.reply({ content: denial, ephemeral: true });
    return;
  }
  const match = /^feature_set_(enable|disable)_(.+)$/.exec(interaction.customId);
  const key = match?.[2];
  if (!match || !key || !isFeatureKey(key)) {
    await interaction.reply({ content: 'Unknown feature category.', ephemeral: true });
    return;
  }
  if (key === 'dmPublicCommands' && !isOwner(interaction.user.id)) {
    await interaction.reply({ content: 'Only the bot owner can change the global DM setting.', ephemeral: true });
    return;
  }
  setFeatureState(interaction.guild.id, key, match[1] === 'enable');
  await interaction.update(
    buildFeatureToggleView(interaction.guild.id, key, isOwner(interaction.user.id)),
  );
}
