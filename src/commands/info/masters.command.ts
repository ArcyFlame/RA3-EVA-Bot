import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { RA3Bot } from '../../bot';
import { masterRepository } from '../../repositories/master.repository';
import { sanitizeInput } from '../../utils/sanitize';

export const data = new SlashCommandBuilder()
  .setName('masters')
  .setDescription('Show the Hall of Fame (all-time masters)');

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const masters = masterRepository.getAll();
  if (masters.length === 0) {
    await interaction.editReply({ content: 'No masters in Hall of Fame yet.' });
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
  await interaction.editReply({ embeds: [embed] });
}
