import { EmbedBuilder, escapeMarkdown } from 'discord.js';
import { Master } from '../../repositories/master.repository';
import { sanitizeInput } from '../../utils/sanitize';
import { GameId, GAME_CONFIGS } from '../../config/games';

function patchLabel(patch: string | undefined): string {
  if (!patch) return '';
  const label = patch.toLowerCase().startsWith('patch') ? patch : `Patch ${patch}`;
  return ` | ${escapeMarkdown(sanitizeInput(label, 56))}`;
}

export function buildMastersEmbed(masters: Master[], game: GameId = 'ra3'): EmbedBuilder {
  const byYear = new Map<number, Master[]>();
  for (const master of masters) {
    const entries = byYear.get(master.year) ?? [];
    entries.push(master);
    byYear.set(master.year, entries);
  }

  const embed = new EmbedBuilder()
    .setTitle(`🏅 ${GAME_CONFIGS[game].shortLabel} Hall of Fame`)
    .setDescription('Masters remembered across every competitive season.')
    .setColor(0xffb900);

  for (const [year, entries] of [...byYear.entries()].slice(0, 25)) {
    const chunks: string[] = [];
    let chunk = '';
    for (const entry of entries) {
      const line = `• **${escapeMarkdown(sanitizeInput(entry.name, 50))}**${patchLabel(entry.patch)}`;
      if (chunk && chunk.length + line.length + 1 > 1024) {
        chunks.push(chunk);
        chunk = '';
      }
      chunk += (chunk ? '\n' : '') + line;
    }
    if (chunk) chunks.push(chunk);
    for (const [index, value] of chunks.entries()) {
      if ((embed.data.fields?.length ?? 0) >= 25) break;
      embed.addFields({ name: `🏆 ${year}${index ? ' (continued)' : ''}`, value, inline: false });
    }
  }
  embed.setFooter({
    text: `${masters.length} master${masters.length === 1 ? '' : 's'} • newest year first`,
  });
  return embed;
}
