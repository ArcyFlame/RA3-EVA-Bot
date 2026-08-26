import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ComponentType,
  PermissionFlagsBits,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { isAdmin } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';
import { guildRepository } from '../../repositories/guild.repository';
import { HelpView } from './help.view';
import { getGameContext } from '../../utils/game-context';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Show interactive help menu');

export const guildOnly = false;

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  const member = interaction.guild ? await resolveMember(interaction) : null;
  // Admin Tools + Moderation tabs are visible to admins AND moderators.
  const staff =
    member !== null &&
    (isAdmin(member) ||
      member.permissions.any([
        PermissionFlagsBits.KickMembers,
        PermissionFlagsBits.BanMembers,
        PermissionFlagsBits.ModerateMembers,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ManageGuild,
      ]));
  const hidden = interaction.guild
    ? guildRepository.getHiddenHelpCategories(interaction.guild.id)
    : [];
  const view = new HelpView(staff, undefined, hidden, getGameContext(interaction.guildId).game);
  const reply = await interaction.reply({
    embeds: [view.getEmbed()],
    components: view.getComponents(),
    ephemeral: true,
    fetchReply: true,
  });
  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    time: 60000,
  });
  collector.on('collect', async (selectInteraction) => {
    if (selectInteraction.user.id !== interaction.user.id) {
      await selectInteraction.reply({ content: 'This menu is not for you.', ephemeral: true });
      return;
    }
    const value = selectInteraction.values[0];
    await view.handleSelect(selectInteraction, value);
  });
}
