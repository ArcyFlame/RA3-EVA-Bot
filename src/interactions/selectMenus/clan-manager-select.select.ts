import {
  StringSelectMenuInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { clanRepository } from '../../repositories/clan.repository';
import { parseCustomIdInt } from '../../utils/parse';

/**
 * Clan manager select: `clanmgr_sel_{clanId}`. Shows the clan's details with
 * Remove / Edit actions (clanmgr_del_ / clanmgr_edit_ handlers).
 */
export const customIdPrefix = 'clanmgr_sel_';

export async function execute(_bot: RA3Bot, interaction: StringSelectMenuInteraction) {
  if (!interaction.guild) return;

  const clanId = parseCustomIdInt(interaction.customId, 2);
  if (clanId === null) {
    await interaction.reply({ content: 'Invalid clan.', ephemeral: true });
    return;
  }
  const clan = clanRepository.findById(clanId, interaction.guild.id);
  if (!clan) {
    await interaction.reply({ content: 'Clan no longer exists.', ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`🛡️ ${clan.name} [${clan.tag}]`)
    .setDescription(clan.description || 'No description.')
    .setColor(0x5865f2)
    .addFields(
      { name: 'Leader', value: `<@${clan.ownerId}>`, inline: true },
      { name: 'Members', value: `${clanRepository.getMemberCount(clan.id)}/${clan.maxMembers}`, inline: true },
      { name: 'Approved', value: clan.approved === 1 ? 'Yes' : 'No', inline: true },
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`clanmgr_edit_${clan.id}`)
      .setLabel('✏️ Edit')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`clanmgr_del_${clan.id}_${interaction.guild.id}`)
      .setLabel('🗑️ Remove')
      .setStyle(ButtonStyle.Danger),
  );
  await interaction.update({ embeds: [embed], components: [row] });
}
