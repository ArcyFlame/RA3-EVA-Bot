import { EmbedBuilder } from 'discord.js';
import { Master } from '../../repositories/master.repository';
import { sanitizeInput } from '../../utils/sanitize';

function patchLabel(patch: string | undefined): string {
  if (!patch) return '';
  const label = patch.toLowerCase().startsWith('patch') ? patch : `Patch ${patch}`;
  return ` · 🛠️ ${label}`;
}

export function buildMastersEmbed(masters: Master[]): EmbedBuilder {
  const byYear = new Map<number, Master[]>();
  for (const master of masters) {
    const entries = byYear.get(master.year) ?? [];
    entries.push(master);
    byYear.set(master.year, entries);
  }

  const embed = new EmbedBuilder()
    .setTitle('🏛️ Red Alert 3 Hall of Fame')
    .setDescription('Masters remembered across every competitive season.')
    .setColor(0xffb900);

  for (const [year, entries] of [...byYear.entries()].slice(0, 25)) {
    embed.addFields({
      name: `🏆 ${year}`,
      value: entries
        .map((entry) => `🥇 **${sanitizeInput(entry.name, 50)}**${patchLabel(entry.patch)}`)
        .join('\n')
        .slice(0, 1024),
      inline: false,
    });
  }
  embed.setFooter({ text: `${masters.length} master${masters.length === 1 ? '' : 's'} • newest year first` });
  return embed;
}
