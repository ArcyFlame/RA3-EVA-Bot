import { ActionRowBuilder, ButtonInteraction, StringSelectMenuBuilder } from 'discord.js';
import { RA3Bot } from '../../bot';
import { guildRepository } from '../../repositories/guild.repository';
import { denyUnlessAdmin } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';

export const customId = 'feature_help_categories';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  if (!interaction.guild) return;
  const denial = denyUnlessAdmin(await resolveMember(interaction));
  if (denial) {
    await interaction.reply({ content: denial, ephemeral: true });
    return;
  }
  const categories = ['tournaments', 'community', 'profile', 'info', 'admin', 'moderation'];
  const hidden = guildRepository.getHiddenHelpCategories(interaction.guild.id);
  const select = new StringSelectMenuBuilder()
    .setCustomId('feature_help_categories_select')
    .setPlaceholder('Categories selected here are hidden')
    .setMinValues(0)
    .setMaxValues(categories.length)
    .addOptions(
      categories.map((category) => ({
        label: category.charAt(0).toUpperCase() + category.slice(1),
        value: category,
        default: hidden.includes(category),
      })),
    );
  await interaction.reply({
    content: 'Select the help categories to hide on this server. Leave everything unselected to show all categories.',
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
    ephemeral: true,
  });
}
