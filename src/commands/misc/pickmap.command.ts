import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { RA3Bot } from '../../bot';
import { tournamentRepository } from '../../repositories/tournament.repository';

/** Maps shipped with the Community Patch 1.12.8 ladder pool. */
const PATCH_1_12_8_URL = 'https://www.gamereplays.org/community/index.php?showtopic=1083648';
const patchMaps = new Set([
  'battlebase alpha',
  'battlebase delta',
  'deep cold',
  'erebor lament',
  'grinderberg',
  'isla pascua',
  'misty abyss',
  'pacific paradise',
  'scorching sands',
  'thermal tension',
  'lake of albatross',
]);

const competitiveMaps = [
  'Battlebase Alpha',
  'Battlebase Delta',
  'Deep Cold',
  'Erebor Lament',
  'Grinderberg',
  'Infinity Isle',
  'Isla Pascua',
  'Lake of Albatross',
  'Misty Abyss',
  'Pacific Paradise',
  'Scorching Sands',
  'Thermal Tension',
  'Tournament Tower',
  'Wasteland',
  'Cabana Republic',
  'Hammer Beach',
  'Remo Crossing',
];

/** Finds the newest event whose stored map pool matches the given title. */
function eventPoolByName(title: string): { event: string; maps: string[] } | null {
  const want = title.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!want) return null;
  const events = tournamentRepository.getAnnouncements();
  for (let i = events.length - 1; i >= 0; i--) {
    const detail = tournamentRepository.getEventDetail(events[i].id);
    if (!detail?.maps || detail.maps.length < 3) continue;
    const base = events[i].title
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (base.includes(want.slice(0, 10)) || want.includes(base.slice(0, 10))) {
      return {
        event: events[i].title,
        maps: detail.maps.split(/,\s*/).filter(Boolean),
      };
    }
  }
  return null;
}

/** images/maps/<slug>.png — drop official minimaps there and they show up. */
function minimapPath(mapName: string): string | undefined {
  const slug = mapName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const p = join(process.cwd(), 'images', 'maps', `${slug}.png`);
  return existsSync(p) ? p : undefined;
}

function downloadButton(mapName: string): ButtonBuilder {
  if (patchMaps.has(mapName.toLowerCase())) {
    return new ButtonBuilder()
      .setLabel('1.12.8 Map Pack')
      .setStyle(ButtonStyle.Link)
      .setURL(PATCH_1_12_8_URL);
  }
  return new ButtonBuilder()
    .setLabel('Download')
    .setStyle(ButtonStyle.Link)
    .setURL('https://www.cnclabs.com/maps/redalert3/maps.aspx');
}

export const data = new SlashCommandBuilder()
  .setName('pickmap')
  .setDescription('Esports map picker')
  .addSubcommand((sub) =>
    sub
      .setName('random')
      .setDescription('Pick a random competitive map')
      .addStringOption((opt) =>
        opt
          .setName('event')
          .setDescription('Pick from this event\u2019s map pool (fuzzy title)')
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('list')
      .setDescription('List the competitive map pool (or an event\u2019s pool)')
      .addStringOption((opt) =>
        opt
          .setName('event')
          .setDescription('Show this event\u2019s map pool (fuzzy title)')
          .setRequired(false),
      ),
  );

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();
  const eventTitle = interaction.options.getString('event');
  const pool = eventTitle
    ? eventPoolByName(eventTitle)
    : null;
  if (eventTitle && !pool) {
    await interaction.reply({
      content: `No stored map pool matches **${eventTitle}**. Run \`/tournaments_scan\` or check the title.`,
      ephemeral: true,
    });
    return;
  }
  const maps = pool ? pool.maps : competitiveMaps;

  if (sub === 'list') {
    const embed = new EmbedBuilder()
      .setTitle(`🗺️ Map Pool${pool ? `: ${pool.event}` : ' (Competitive)'}`)
      .setDescription(maps.map((m) => `• **${m}**`).join('\n').slice(0, 4000))
      .setColor(0x00ae86)
      .setFooter({ text: '1.12.8 pool maps link to the patch map pack.' });
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let i = 0; i < maps.length && rows.length < 5; i += 5) {
      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          ...maps.slice(i, i + 5).map((m) => downloadButton(m).setLabel(
            patchMaps.has(m.toLowerCase()) ? `${m} · 1.12.8` : m.slice(0, 60),
          )),
        ),
      );
    }
    await interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
    return;
  }

  // random
  const map = maps[Math.floor(Math.random() * maps.length)];
  const embed = new EmbedBuilder()
    .setTitle('🗺️ Random Map')
    .setDescription(`**${map}**${pool ? `\nFrom the pool of **${pool.event}**` : ''}`)
    .setColor(0x00ae86)
    .setFooter({ text: 'Use /pickmap again for another map' });

  const minimap = minimapPath(map);
  const files: Array<{ attachment: string; name: string }> = [];
  if (minimap) {
    files.push({ attachment: minimap, name: 'minimap.png' });
    embed.setImage('attachment://minimap.png');
  }
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(downloadButton(map));
  await interaction.reply({ embeds: [embed], components: [row], files });
}
