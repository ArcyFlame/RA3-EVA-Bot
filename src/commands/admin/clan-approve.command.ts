import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { clanRepository } from '../../repositories/clan.repository';
import { guildRepository } from '../../repositories/guild.repository';
import { denyUnlessAdmin } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';

export const data = new SlashCommandBuilder()
  .setName('clan_approve')
  .setDescription('[Admin] Approve or reject pending clans')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Server only.', ephemeral: true });
    return;
  }

  const guildData = guildRepository.findByDiscordId(interaction.guild.id);
  if (guildData?.clansEnabled === 0) {
    await interaction.reply({
      content: '❌ Clan system is disabled on this server.',
      ephemeral: true,
    });
    return;
  }

  const member = await resolveMember(interaction);
  const denial = denyUnlessAdmin(member);
  if (denial) {
    await interaction.reply({ content: denial, ephemeral: true });
    return;
  }

  const pending = clanRepository.findPending(interaction.guild.id);
  if (pending.length === 0) {
    await interaction.reply({ content: 'No pending clans.', ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('Pending Clans')
    .setDescription('Click the buttons below to approve or reject.')
    .setColor(0xffa500);

  // Discord caps an action row at 5 buttons — chunk by clan so each row keeps
  // its (approve, reject) pair together (2 clans / 4 buttons per row).
  const buttons = pending
    .slice(0, 6)
    .flatMap((clan) => [
      new ButtonBuilder()
        .setCustomId(`approve_clan_${clan.id}`)
        .setLabel(`✅ Approve ${clan.name}`.slice(0, 80))
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`reject_clan_${clan.id}`)
        .setLabel(`❌ Reject ${clan.name}`.slice(0, 80))
        .setStyle(ButtonStyle.Danger),
    ]);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < buttons.length; i += 4) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + 4)));
  }

  await interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
}
