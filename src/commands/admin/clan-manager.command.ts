import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { clanRepository } from '../../repositories/clan.repository';
import { isAdmin } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';

export const data = new SlashCommandBuilder()
  .setName('clan_manager')
  .setDescription('[Admin/Mod] Manage clans: approvals, editing, removal (menu)');

/**
 * Builds the interactive clan manager: pending approvals shortcut + a select
 * menu of every clan. Picking a clan shows its details with Remove/Edit
 * actions (handled by the clanmgr_* component handlers).
 */
export function buildClanManagerView(
  guildId: string,
): { embeds: [EmbedBuilder]; components: any[] } | null {
  const clans = clanRepository.findApproved(guildId);
  const pending = clanRepository.findPending(guildId);

  const embed = new EmbedBuilder()
    .setTitle('🛡️ Clan Manager')
    .setDescription(
      `**${clans.length}** approved clan(s), **${pending.length}** pending approval.\n` +
        'Pick a clan below to edit or remove it, or open the pending approvals first.',
    )
    .setColor(0x5865f2)
    .setFooter({ text: 'Admin & moderator tool' });

  const components: any[] = [];

  if (pending.length > 0) {
    embed.addFields({
      name: '⏳ Pending',
      value: pending
        .slice(0, 10)
        .map((c) => `• **${c.name}** [${c.tag}] <@${c.ownerId}>`)
        .join('\n'),
    });
  }

  if (clans.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId('clanmgr_select')
      .setPlaceholder('Select a clan to manage…')
      .addOptions(
        ...clans.slice(0, 25).map((c) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(`${c.name} [${c.tag}]`.slice(0, 100))
            .setValue(`clanmgr_sel_${c.id}`)
            .setDescription(`${clanRepository.getMemberCount(c.id)} members`),
        ),
      );
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('clanmgr_pending')
      .setLabel('⏳ Pending Approvals')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('clanmgr_refresh').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary),
  );
  components.push(row);

  if (components.length === 0) return null;
  return { embeds: [embed], components };
}

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {  if (!interaction.guild) {
    await interaction.reply({ content: 'Server only.', ephemeral: true });
    return;
  }

  const member = await resolveMember(interaction);
  // Admins and moderators (Discord moderation permissions) may manage clans.
  const moderator =
    member !== null &&
    (isAdmin(member) ||
      member.permissions.any([
        PermissionFlagsBits.KickMembers,
        PermissionFlagsBits.BanMembers,
        PermissionFlagsBits.ManageGuild,
        PermissionFlagsBits.ModerateMembers,
      ]));
  if (!member || !moderator) {
    await interaction.reply({
      content: '❌ Only admins and moderators can use the clan manager.',
      ephemeral: true,
    });
    return;
  }

  const view = buildClanManagerView(interaction.guild.id);
  if (!view) {
    await interaction.reply({ content: 'No clans on this server yet.', ephemeral: true });
    return;
  }
  await interaction.reply({ ...view, ephemeral: true });
}
