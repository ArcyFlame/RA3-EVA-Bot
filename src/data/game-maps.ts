import { GameId } from '../config/games';

export interface MapGroup {
  label: string;
  maps: readonly string[];
}

export const RA3_TOURNAMENT_MAPS = [
  'Battlebase Beta',
  'Cabana Republic',
  'Fire Island',
  'Industrial Strength',
  'Infinity Isle',
  'Snow Plow',
  'Temple Prime',
] as const;

export const RA3_MAP_GROUPS: readonly MapGroup[] = [
  {
    label: '2 Player Vanilla',
    maps: [
      'Battlebase Beta',
      'Cabana Republic',
      'Canals of Carnage',
      'Casual Encounter',
      'Fire Island',
      'Industrial Strength',
      'Infinity Isle',
      'Secret Shrine',
      'Snow Plow',
      'Spring Fever',
      'Temple Prime',
    ],
  },
  {
    label: '2 Player Uprising & Bonus',
    maps: [
      'Au Revoir Reservoir',
      'Black Tortoise',
      'Deep End',
      'Dreadnought Alley',
      'Grinder Gulch',
      'Hard Lesson',
      'Island Arena',
      'Killington Cove',
      'Kodiak Lake',
      "Mir's Landing",
      'Pier Pressure',
      'Pure Oniage',
      'Rival Schools',
      'Soundless Hill',
      'Turtle Village',
      'Twisted Terrace',
      'Wrong Steppe',
    ],
  },
  {
    label: '2 Player Community',
    maps: [
      'Absolute Zero',
      'Battlebase Alpha',
      'Battlebase Delta',
      'Battlebase Epsilon',
      'Battlebase Gamma',
      'Bigger Piece of Dune',
      'Blood Moonlight',
      'Conch Bay',
      'Deep Cold',
      'Desert Oasis',
      'Emerald Canyon',
      "Emperor's Ruins",
      'Epicenter Island',
      'Erebor Lament',
      'Eternal Conflict',
      'Fortitude Flatland',
      'Grinderberg',
      'Holiday Island',
      'Infinity Iceland',
      'Isla Pascua',
      'Isle of Peace',
      'Lake Diamante',
      'Lake of Albatross',
      'Lake Resort',
      'Liberty Stand',
      'Libration Freeze',
      'Mayday Relay',
      'Misty Abyss',
      'Pacific Paradise',
      'Palm Panic',
      'Poppies of Provence',
      'Scorching Sands',
      'Snow Valley',
      'Springhaven',
      'Thermal Tension',
      'Tokyo Crossing',
      'Tropical Age',
      'Whale Village',
      'Yucatan Islands',
      'Zero Island',
    ],
  },
  {
    label: '3 Player',
    maps: [
      'Caldera of Chaos',
      'Hidden Fortress',
      'Pyroclasm',
      'Fried River',
      'Islandgrad',
      'Repair Bay',
    ],
  },
  {
    label: '4 Player Vanilla',
    maps: [
      'Battlebase Octopon',
      "Blitzen's Back",
      'Cold Showdown',
      'Death Aquatic',
      'Hostile Hostel',
      'Pool Party',
      'Reef Madness',
      'Ring of Fire',
      'Rock Ridge',
      'Roundhouse Redux',
    ],
  },
  {
    label: '4 Player Uprising & Bonus',
    maps: [
      'Age of Wreckoning',
      "Assassin's Road",
      'Battlebase Quartus',
      'Bear Zamok',
      'Corporate Warfare',
      'Desolation',
      'Florazon Basin',
      'Honor Bound',
      'Isla Nooblar',
      'Jungle Stalkers',
      'Last Resort',
      'Neon Crisis',
      'Oil Slick',
      "Shogun's Alley",
      'Trench Warfare',
    ],
  },
  {
    label: '4 Player Community',
    maps: [
      'Battlebase Luma',
      'Battlebase Solis',
      'Battlebase Tera',
      'Business District',
      'Chichen Itza',
      'Desert Dominator',
      'Dual Duel',
      'Easter Party',
      "Emperor's Gardens",
      'Freeze Factor',
      'Frostbite Valley',
      'Garden of War',
      'Hostile Havana',
      'Misty Castle',
      'Rail Transit',
      'River Rivals',
      'Sandy Lagoon',
      'Spring Allure',
      'Stronghold Miry',
      'Surrounding Shores',
      'Watering Hole',
      'Windmill Island',
    ],
  },
  {
    label: '5 Player',
    maps: ['Circus Maximus', 'Murder Mesa', 'Loch Mess'],
  },
  {
    label: '6 Player Vanilla & Bonus',
    maps: [
      'Burnt-Out Paradise',
      'Carville',
      'Magmageddon',
      'Sub-Zero Hour',
      'Apocalypse Mountain',
      'Battlebase Hexis',
      'Holdout Keep',
      'Swimming Hazard',
    ],
  },
  {
    label: '6 Player Community',
    maps: [
      'Aquatic Arena',
      'Battlebase Koi',
      'Battlebase X',
      'Besieged Reservoir',
      'Black Treasury',
      'Broken Clock',
      'Coldville',
      'Corporate Coalition',
      'Crimson Passage',
      'Diamond City',
      'Fallen Horizon',
      'Frozen Judgment',
      'Garden of Harmony',
      'Hot Conflict',
      'Isla Gargantua',
      'Isle of Outcasts',
      'Ocean Party',
      'Paradise Valley',
      'Pool March',
      'Serenity Gardens',
      'Snow Kingdom',
      'Snowflake',
      'Snowtop Conqueror',
      'Spring Showdown',
      'Vestige Assault',
    ],
  },
] as const;

export const GENEVO_RAW_MAPS = [
  'genevo033_Adriane_skrm_01',
  'genevo033_Adriane_skrm_01b',
  'genevo033_Aymcam_skrm_01',
  'genevo033_Aymcam_skrm_02',
  'genevo033_Aymcam_skrm_03',
  'genevo033_Aymcam_skrm_03b',
  'genevo033_Aymcam_skrm_04',
  'genevo033_Aymcam_skrm_05',
  'genevo033_Bluess_skrm_01',
  'genevo033_Bluess_skrm_02',
  'genevo033_Bluess_skrm_03',
  'genevo033_Bluess_skrm_04',
  'genevo033_ClouD_skrm_01',
  'genevo033_ClouD_skrm_01b',
  'genevo033_ClouD_skrm_02',
  'genevo033_darkyuri_skrm_01',
  'genevo033_darkyuri_skrm_02',
  'genevo033_dereaper89_skrm_01',
  'genevo033_haubibban_skrm_01',
  'genevo033_Predatore_skrm_01',
  'genevo033_sgor00_skrm_01',
  'genevo033_sgor00_skrm_02',
  'genevo033_sgor00_skrm_03',
  'genevo033_sgor00_skrm_04',
  'genevo033_sgor00_skrm_05',
  'genevo033_sgor00_skrm_06',
  'genevo033_sgor00_skrm_07',
  'genevo033_sgor00_skrm_08',
  'genevo033_sgor00_skrm_09',
  'genevo033_sgor00_skrm_10',
  'genevo033_sgor00_skrm_10b',
  'genevo033_sgor00_skrm_11',
  'genevo033_sgor00_skrm_11b',
  'genevo033_sgor00_skrm_12',
  'genevo033_sgor00_skrm_13',
  'genevo033_sgor00_skrm_14',
  'genevo033_sgor00_skrm_15',
  'genevo033_sgor00_skrm_16',
  'genevo033_sgor00_skrm_17',
  'genevo033_sgor00_skrm_18',
  'genevo033_sgor00_skrm_18b',
  'genevo033_sgor00_skrm_19',
  'genevo033_sgor00_skrm_20',
  'genevo033_sgor00_skrm_21',
  'genevo033_sgor00_skrm_22',
  'genevo033_sgor00_skrm_22b',
  'genevo033_sgor00_skrm_23',
  'genevo033_sgor00_skrm_24',
  'genevo033_sgor00_skrm_25',
] as const;

const RA3_EXTRA_ALIASES: Record<string, string> = {
  feasel1: 'Fire Island',
  feasel2: 'Carville',
  feasel4: 'Deep Cold',
  feasel5: 'Heidelberg',
  feasel6: 'Yokohama',
  feasel8: 'Infinity Isle',
  rao1: 'Misty Abyss',
  templelegend: 'Temple Prime',
  springwalker: 'Spring Walker',
  chrysoberylgarden: 'Libration Freeze',
  liberationfreeze: 'Libration Freeze',
  librationfreeze: 'Libration Freeze',
  aquaecaerulea: 'Battlebase Epsilon',
  tankcrash: 'Tank Crash',
  redemptionbase: 'Redemption Base',
  tournamenttower: 'Tournament Tower',
  wasteland: 'Wasteland',
  hammerbeach: 'Hammer Beach',
  remocrossing: 'Remo Crossing',
  heidelberg: 'Heidelberg',
  yokohama: 'Yokohama',
};

function mapKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export const GENEVO_MAP_LABELS: Readonly<Record<string, string>> = {
  genevo033_sgor00_skrm_10: 'Tournament Island',
  genevo033_sgor00_skrm_11: 'Naval Yard',
  genevo033_sgor00_skrm_12: 'Defcon 6',
  genevo033_sgor00_skrm_13: 'Lone Eagle',
  genevo033_sgor00_skrm_14: 'Hostile Dawn',
  genevo033_sgor00_skrm_15: 'Sand Serpent',
  genevo033_sgor00_skrm_16: 'Forgotten Forest',
  genevo033_sgor00_skrm_17: 'Delta Facility',
  genevo033_sgor00_skrm_18: 'Barren Badlands',
  genevo033_sgor00_skrm_19: 'Turtle Mountain',
  genevo033_sgor00_skrm_20: 'Fords of Dvina',
  genevo033_sgor00_skrm_21: 'Wild Valley',
  genevo033_sgor00_skrm_22: 'Small Town GLA',
  genevo033_sgor00_skrm_23: 'Broken Border',
  genevo033_sgor00_skrm_24: 'Cairo Commandos',
  genevo033_sgor00_skrm_25: 'Dark Mountain',
  genevo033_sgor00_skrm_01: 'Canyon City',
  genevo033_sgor00_skrm_02: 'Fallen Empire',
  genevo033_sgor00_skrm_03: 'Bad Evening',
  genevo033_sgor00_skrm_04: 'Twilight Flame',
  genevo033_sgor00_skrm_05: 'Autumn Garden',
  genevo033_sgor00_skrm_06: 'Homeland Alliance',
  genevo033_sgor00_skrm_07: 'Frozen Pipeline',
  genevo033_sgor00_skrm_08: 'Tournament Desert',
  genevo033_sgor00_skrm_09: 'Armored Fury',
  genevo033_sgor00_skrm_10b: 'Tournament Big Island',
  genevo033_sgor00_skrm_11b: 'Naval Base',
  genevo033_sgor00_skrm_18b: 'Dark Badlands',
  genevo033_sgor00_skrm_22b: 'Small City GLA',
  genevo033_adriane_skrm_01: 'Naval Port Reyes',
  genevo033_adriane_skrm_01b: 'Night Port Reyes',
  genevo033_aymcam_skrm_01: 'Cold Drops',
  genevo033_aymcam_skrm_02: "King's Hill",
  genevo033_aymcam_skrm_03: 'Tournament Tundra',
  genevo033_aymcam_skrm_03b: 'Tournament Frostbite',
  genevo033_aymcam_skrm_04: 'Toxic Wasteland',
  genevo033_aymcam_skrm_05: 'European Rain',
  genevo033_bluess_skrm_01: 'Boreal Battle',
  genevo033_bluess_skrm_02: 'Boreal Beatdown',
  genevo033_bluess_skrm_03: 'Boreal Brawl',
  genevo033_bluess_skrm_04: 'Avalanche Assault',
  genevo033_cloud_skrm_01: 'Tournament A',
  genevo033_cloud_skrm_01b: 'Tournament Alpha',
  genevo033_cloud_skrm_02: 'Frostpunk Valleys',
  genevo033_predatore_skrm_01: 'Coastal Confrontation',
  genevo033_darkyuri_skrm_01: 'Flash Effect',
  genevo033_darkyuri_skrm_02: 'Land of Wolves',
  genevo033_dereaper89_skrm_01: 'Dry Valley',
  genevo033_haubibban_skrm_01: 'Vendetta',
};

export function formatGenevoMapName(rawName: string): string {
  const clean =
    rawName
      .replace(/\\/g, '/')
      .split('/')
      .pop()
      ?.replace(/\.map$/i, '') ?? rawName;
  const match = clean.match(/^genevo(\d{3})_([^_]+)_skrm_(\d+[a-z]?)$/i);
  const known = GENEVO_MAP_LABELS[clean.toLowerCase()];
  if (known) return known;
  if (!match) {
    return clean
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
      .trim();
  }
  return `GenEvo${match[1]} ${match[2]} Skrm ${match[3]}`;
}

export const GENEVO_MAPS = GENEVO_RAW_MAPS.map(formatGenevoMapName);

export const RA3_MAPS = [...new Set(RA3_MAP_GROUPS.flatMap((group) => [...group.maps]))];
const RA3_CANONICAL = new Map(RA3_MAPS.map((name) => [mapKey(name), name]));
for (const [key, value] of Object.entries(RA3_EXTRA_ALIASES)) RA3_CANONICAL.set(key, value);

const GENEVO_CANONICAL = new Map<string, string>();
for (let index = 0; index < GENEVO_RAW_MAPS.length; index++) {
  GENEVO_CANONICAL.set(mapKey(GENEVO_RAW_MAPS[index]), GENEVO_MAPS[index]);
  GENEVO_CANONICAL.set(mapKey(GENEVO_MAPS[index]), GENEVO_MAPS[index]);
}

export function cleanGameMapName(rawName: string, game: GameId): string {
  let clean =
    rawName
      .replace(/\\/g, '/')
      .split('/')
      .pop()
      ?.replace(/\.map$/i, '') ?? rawName;
  clean = clean.replace(/\[.*?\]/g, '').trim();
  const key = mapKey(clean.replace(/^ra3bn_/i, '').replace(/^map_mp_[1-6]_/i, ''));
  const canonical = game === 'genevo' ? GENEVO_CANONICAL.get(key) : RA3_CANONICAL.get(key);
  if (canonical) return canonical;
  if (game === 'genevo' && /^genevo\d{3}_/i.test(clean)) return formatGenevoMapName(clean);
  const readable = clean
    .replace(/^ra3bn_/i, '')
    .replace(/^map_mp_[1-6]_/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  return readable.replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'Unknown';
}

export function isKnownGameMap(rawOrDisplayName: string, game: GameId): boolean {
  const clean = cleanGameMapName(rawOrDisplayName, game);
  const key = mapKey(clean);
  const source = game === 'genevo' ? GENEVO_CANONICAL : RA3_CANONICAL;
  if (source.has(key)) return true;
  for (const known of source.keys()) {
    if (key.length >= 5 && (key.startsWith(known) || known.startsWith(key))) return true;
  }
  return false;
}

/** Identifies a lobby without mixing base RA3, Generals Evolution or other mods. */
export function matchesGameLobby(
  rawMapName: string,
  rawModName: string | undefined,
  game: GameId,
): boolean {
  const mod = String(rawModName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (game === 'genevo') {
    return mod === 'genevo' || mod === 'generalsevolution' || isKnownGameMap(rawMapName, game);
  }
  if (mod && mod !== 'ra3' && mod !== 'redalert3') return false;
  return isKnownGameMap(rawMapName, game);
}

export function gameMapNames(game: GameId): string[] {
  return game === 'genevo' ? [...GENEVO_MAPS] : [...RA3_MAPS];
}

export function gameMapGroups(game: GameId): readonly MapGroup[] {
  if (game === 'genevo') {
    return [
      { label: 'Generals Evolution 0.33 (1-25)', maps: GENEVO_MAPS.slice(0, 25) },
      { label: 'Generals Evolution 0.33 (26-49)', maps: GENEVO_MAPS.slice(25) },
    ];
  }
  return RA3_MAP_GROUPS;
}
