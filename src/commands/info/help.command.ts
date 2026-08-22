import { SlashCommandBuilder, ChatInputCommandInteraction, ComponentType, PermissionFlagsBits } from 'discord.js';
import { RA3Bot } from '../../bot';
import { isAdmin } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';
import { guildRepository } from '../../repositories/guild.repository';
import { HelpView } from './help.view';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Show interactive help menu');

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    // In DMs, treat as non-staff (show only public categories)
    const view = new HelpView(false);
    await interaction.reply({
      embeds: [view.getEmbed()],
      components: view.getComponents(),
      ephemeral: true,
    });
    return;
  }
  const member = await resolveMember(interaction);
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
  const hidden = guildRepository.getHiddenHelpCategories(interaction.guild.id);
  const view = new HelpView(staff, undefined, hidden);
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
