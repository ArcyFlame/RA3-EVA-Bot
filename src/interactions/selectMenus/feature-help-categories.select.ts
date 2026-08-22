import { StringSelectMenuInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { guildRepository } from '../../repositories/guild.repository';
import { denyUnlessAdmin } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';

export const customId = 'feature_help_categories_select';

export async function execute(_bot: RA3Bot, interaction: StringSelectMenuInteraction) {
  if (!interaction.guild) return;
  const denial = denyUnlessAdmin(await resolveMember(interaction));
  if (denial) {
    await interaction.reply({ content: denial, ephemeral: true });
    return;
  }
  guildRepository.setHiddenHelpCategories(interaction.guild.id, interaction.values);
  await interaction.update({
    content: interaction.values.length
      ? `Hidden help categories: ${interaction.values.join(', ')}.`
      : 'All help categories are visible.',
    components: [],
  });
}
