import {
  ButtonInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  GuildMember,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { clanRepository } from '../../repositories/clan.repository';
import { parseCustomIdInt } from '../../utils/parse';

export const customIdPrefix = 'clan_transfer_';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Server only.', ephemeral: true }).catch(() => null);
    return;
  }
  const guild = interaction.guild;

  const clanId = parseCustomIdInt(interaction.customId, 2);
  if (clanId === null) {
    await interaction.reply({ content: 'Invalid clan.', ephemeral: true });
    return;
  }
  const clan = clanRepository.findById(clanId);
  if (!clan || clan.ownerId !== interaction.user.id) {
    await interaction.reply({ content: 'You are not the leader of this clan.', ephemeral: true });
    return;
  }
  const members = clanRepository.getMembers(clanId);
  const otherMembers = members.filter((m) => m !== interaction.user.id);
  if (otherMembers.length === 0) {
    await interaction.reply({ content: 'No other members to transfer to.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const resolved = await Promise.all(
    otherMembers.slice(0, 25).map(async (memberId) => ({
      memberId,
      member: await guild.members.fetch(memberId).catch(() => null),
    })),
  );
  const options = resolved
    .filter((r): r is { memberId: string; member: GuildMember } => r.member !== null)
    .map((r) =>
      new StringSelectMenuOptionBuilder().setLabel(r.member.displayName).setValue(r.memberId),
    );

  if (options.length === 0) {
    await interaction.editReply({ content: 'No eligible members found.' });
    return;
  }
  const select = new StringSelectMenuBuilder()
    .setCustomId(`clan_transfer_select_${clanId}`)
    .setPlaceholder('Choose new leader')
    .addOptions(options);
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
  await interaction.editReply({ content: 'Select the new clan leader:', components: [row] });
}
