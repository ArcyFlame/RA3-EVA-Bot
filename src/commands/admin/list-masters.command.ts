import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { masterRepository } from '../../repositories/master.repository';
import { denyUnlessAdmin } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';
import { sanitizeInput } from '../../utils/sanitize';

export const data = new SlashCommandBuilder()
  .setName('list_masters')
  .setDescription('[Admin] List all Hall of Fame masters')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  const member = await resolveMember(interaction);
  const denial = denyUnlessAdmin(member);
  if (denial) {
    await interaction.reply({ content: denial, ephemeral: true });
    return;
  }

  const masters = masterRepository.getAll();
  if (masters.length === 0) {
    await interaction.reply({ content: 'No masters in Hall of Fame.', ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder().setTitle('🏅 Hall of Fame').setColor(0xffd700);
  let currentYear = 0;
  const lines: string[] = [];
  for (const r of masters) {
    if (r.year !== currentYear) {
      if (currentYear !== 0) lines.push('');
      lines.push(`**${r.year}**`);
      currentYear = r.year;
    }
    const patchStr = r.patch
      ? r.patch.toLowerCase().startsWith('patch')
        ? ` (${r.patch})`
        : ` (Patch ${r.patch})`
      : '';
    lines.push(`• ${sanitizeInput(r.name, 50)}${patchStr}`);
  }
  embed.setDescription(lines.join('\n').slice(0, 4096));
  await interaction.reply({ embeds: [embed], ephemeral: true });
}
