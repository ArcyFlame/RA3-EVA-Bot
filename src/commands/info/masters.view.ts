import { EmbedBuilder, escapeMarkdown } from 'discord.js';
import { Master } from '../../repositories/master.repository';
import { sanitizeInput } from '../../utils/sanitize';
import { GameId, GAME_CONFIGS } from '../../config/games';
import { GENEVO_LOGO, RA3_LOGO } from '../../utils/emojis';

function patchLabel(patch: string | undefined): string {
  if (!patch) return '';
  const label = patch.toLowerCase().startsWith('patch') ? patch : `Patch ${patch}`;
  return ` | ${escapeMarkdown(sanitizeInput(label, 56))}`;
}

/** Split only at entry boundaries; no master is dropped when Discord needs another message. */
export function mastersListChunks(masters: Omit<Master, 'id'>[], limit = 3900): string[] {
  const entries = [...masters].sort((a, b) => b.year - a.year || a.name.localeCompare(b.name));
  const yearCounts = new Map<number, number>();
  for (const entry of entries) yearCounts.set(entry.year, (yearCounts.get(entry.year) ?? 0) + 1);
  const yearHeading = (year: number, continued = false) => {
    const count = yearCounts.get(year)!;
    return `__**${year}**__  ·  *${count} master${count === 1 ? '' : 's'}${continued ? ' (continued)' : ''}*\n`;
  };
  const chunks: string[] = [];
  let text = '';
  let year: number | undefined;
  for (const entry of entries) {
    const line = `> • **${escapeMarkdown(sanitizeInput(entry.name, 50))}**${patchLabel(entry.patch)}`;
    const heading = year !== entry.year ? `${text ? '\n\n' : ''}${yearHeading(entry.year)}` : '\n';
    if (text && text.length + heading.length + line.length > limit) {
      chunks.push(text);
      text = yearHeading(entry.year, year === entry.year) + line;
    } else text += heading + line;
    year = entry.year;
  }
  if (text) chunks.push(text);
  return chunks.length ? chunks : ['No masters recorded yet.'];
}

export function buildMastersList(masters: Master[], game: GameId = 'ra3'): EmbedBuilder[] {
  const years = [...new Set(masters.map((entry) => entry.year))].sort((a, b) => a - b);
  const logoId = (game === 'ra3' ? RA3_LOGO : GENEVO_LOGO).match(/:(\d+)>$/)![1];
  const summary = masters.length
    ? `**${masters.length}** masters  ·  **${years.length}** recorded year${years.length === 1 ? '' : 's'}  ·  **${years.length > 1 ? `${years[0]} - ${years.at(-1)}` : years[0]}**\n\n`
    : '';
  return mastersListChunks(masters, 3600).map((description, index) =>
    new EmbedBuilder()
      .setAuthor({
        name: GAME_CONFIGS[game].shortLabel,
        iconURL: `https://cdn.discordapp.com/emojis/${logoId}.png`,
      })
      .setTitle(`🏆 Hall of Fame${index ? ' (continued)' : ''}`)
      .setColor(0xd6ad43)
      .setDescription(
        (index ? '' : `*The community's all-time masters, recorded by year.*\n\n${summary}`) +
          description,
      )
      .setFooter({
        text: 'Community honours • Newest year first',
      }),
  );
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
