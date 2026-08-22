import { ButtonInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { RA3Bot } from '../../bot';
import { clanRepository } from '../../repositories/clan.repository';
import { buildClanManagerView } from '../../commands/admin/clan-manager.command';

/**
 * Clan manager buttons: `clanmgr_pending` lists unapproved clans with the
 * standard approve/reject buttons; `clanmgr_refresh` rebuilds the manager.
 */
export const customIdPrefix = 'clanmgr_';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  if (!interaction.guild) return;
  const action = interaction.customId.split('_')[1];
  if (action !== 'pending' && action !== 'refresh') return;

  if (action === 'refresh') {
    const view = buildClanManagerView(interaction.guild.id);
    if (!view) {
      await interaction.update({ content: 'No clans on this server yet.', embeds: [], components: [] });
      return;
    }
    await interaction.update(view);
    return;
  }

  const pending = clanRepository.findPending(interaction.guild.id);
  if (pending.length === 0) {
    await interaction.reply({ content: 'No pending clan approvals. 🎉', ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('⏳ Pending Clan Approvals')
    .setDescription('Approve or reject each clan directly from here.')
    .setColor(0xffa500);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (const clan of pending.slice(0, 5)) {
    embed.addFields({
      name: `${clan.name} [${clan.tag}]`,
      value: `Leader: <@${clan.ownerId}>${clan.description ? `\n> ${clan.description.slice(0, 100)}` : ''}`,
    });
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`approve_clan_${clan.id}_${interaction.guild.id}`)
          .setLabel(`✅ ${clan.tag}`)
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`reject_clan_${clan.id}_${interaction.guild.id}`)
          .setLabel('❌ Reject')
          .setStyle(ButtonStyle.Danger),
      ),
    );
  }
  await interaction.update({ embeds: [embed], components: rows });
}
