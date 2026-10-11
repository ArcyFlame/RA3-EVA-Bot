import { GameId } from '../config/games';

export const TIP_FACTIONS = {
  ra3: { general: 'General', allies: 'Allies', soviets: 'Soviets', empire: 'Empire' },
  genevo: {
    general: 'General',
    usa: 'USA',
    usa_air: 'USA - Air Force',
    usa_laser: 'USA - Laser',
    usa_superweapon: 'USA - Superweapon',
    china: 'China',
    china_nuke: 'China - Nuke',
    china_tank: 'China - Tank',
    china_infantry: 'China - Infantry',
    gla: 'GLA',
    gla_toxin: 'GLA - Toxin',
    gla_demolition: 'GLA - Demolition',
    gla_stealth: 'GLA - Stealth',
  },
} as const;
export interface TipQuote {
  text: string;
  speaker: string;
  game: 'Red Alert 3' | 'Generals / Zero Hour';
  source: string;
}
export interface Tip {
  id: number;
  game: GameId;
  faction: string;
  title: string;
  text: string;
  source: string;
  ruleset: string;
  origin: 'curated' | 'server';
  quote?: TipQuote;
}
const wiki = (page: string) => `https://cnc.fandom.com/wiki/${page}`;
const genevoRelease = 'https://www.moddb.com/news/generals-evolution-beta-033-release';
const usaQuotes = 'https://planetcnc.gamespy.com/Viewfda8.html?game=3&id=50&view=GameInfo.Detail';
function ra3(
  id: number,
  faction: string,
  title: string,
  text: string,
  page: string,
  quote: string,
  speaker: string,
): Tip {
  return {
    id,
    game: 'ra3',
    faction,
    title,
    text,
    source: wiki(page),
    ruleset: 'RA3 1.12',
    origin: 'curated',
    quote: { text: quote, speaker, game: 'Red Alert 3', source: wiki(page) },
  };
}
function genevo(
  id: number,
  faction: string,
  title: string,
  text: string,
  quote: string,
  speaker: string,
  quoteSource: string,
): Tip {
  return {
    id,
    game: 'genevo',
    faction,
    title,
    text,
    source: genevoRelease,
    ruleset: 'GenEvo 0.33',
    origin: 'curated',
    quote: { text: quote, speaker, game: 'Generals / Zero Hour', source: quoteSource },
  };
}
// Each entry keeps its mechanics reference and original voice-line attribution together.
export const CURATED_TIPS: Readonly<Record<GameId, readonly Tip[]>> = {
  ra3: [
    ra3(
      1,
      'allies',
      'Cryocopter support',
      'Cryocopters freeze targets rather than dealing ordinary weapon damage. Bring a damage-dealing unit to finish frozen targets.',
      'Cryocopter',
      "Let's run some field tests!",
      'Cryocopter',
    ),
    ra3(
      2,
      'allies',
      'S.H.R.I.N.K. trade-off',
      'A shrunken vehicle becomes faster but weaker. Follow up with attacks or crushing instead of treating shrink as a stun.',
      'Cryocopter',
      'Size does matter!',
      'Cryocopter',
    ),
    ra3(
      3,
      'allies',
      'Guardian target painting',
      'Target Painter helps other units damage the marked target, but that Guardian stops firing its main gun. Keep other attackers with it.',
      'Guardian_tank',
      "Got 'em in our sights!",
      'Guardian Tank',
    ),
    ra3(
      4,
      'soviets',
      'Clear a garrison',
      'Switch Conscripts to Molotov Cocktail mode to clear enemy infantry from a civilian building. Their rifle mode does not clear garrisons.',
      'Conscript_(Red_Alert_3)',
      'Get out of there!',
      'Conscript',
    ),
    ra3(
      5,
      'soviets',
      'Hammer leeching',
      'A Hammer Tank can recover health with its Leech Beam and acquire a vehicle weapon if the target dies while being leeched. Buildings do not grant weapons.',
      'Hammer_tank',
      "Who's looking for a good pounding?",
      'Hammer Tank',
    ),
    {
      ...ra3(
        6,
        'soviets',
        'Escort your Kirov',
        'Kirovs bomb ground targets but cannot shoot down enemy aircraft. Send anti-air support instead of expecting the airship to defend itself.',
        'Kirov_airship_(Red_Alert_3)',
        'Where are my escorts?!',
        'Kirov Airship',
      ),
      quote: {
        text: 'Where are my escorts?!',
        speaker: 'Kirov Airship',
        game: 'Red Alert 3',
        source: 'https://cnc-central.fandom.com/wiki/Kirov_Airship_(Red_Alert_3)',
      },
      source: 'https://cnc-central.fandom.com/wiki/Kirov_Airship_(Red_Alert_3)',
    },
    ra3(
      7,
      'empire',
      'Choose the Tengu mode',
      'Mecha Tengus fight ground targets; Jet Tengus fight aircraft. Switch to the mode that can attack your intended target.',
      'Mecha_Tengu',
      'These skies belong to us!',
      'Jet Tengu',
    ),
    ra3(
      8,
      'empire',
      'Banzai Charge',
      'Banzai Charge makes Imperial Warriors faster and stun-immune, but replaces their ranged weapon with a sword. Use it for close combat, not ranged fire.',
      'Imperial_Warrior',
      'I serve the Emperor!',
      'Imperial Warrior',
    ),
  ],
  genevo: [
    genevo(
      1,
      'usa',
      'Dozer mine clearing',
      'USA Dozers can clear mines. Clear a mined route before committing your army.',
      'Why do I always get the dirty jobs?',
      'USA Dozer',
      wiki('Construction_dozer_(Generals_1)'),
    ),
    genevo(
      2,
      'usa',
      'Clean hazardous ground',
      'Ambulances remove toxins and radiation and extinguish firestorms. Use one to clear hazardous ground.',
      'What a mess.',
      'Ambulance',
      wiki('Ambulance'),
    ),
    genevo(
      3,
      'usa',
      'Comanche upgrades',
      'Rocket Pods are a Comanche upgrade. Check the upgrade before relying on the ability.',
      'Need a little ground support?',
      'Comanche',
      usaQuotes,
    ),
    genevo(
      4,
      'usa',
      'Aurora return flight',
      'Auroras are invulnerable flying straight with ammunition. After bombing, they slow down and become vulnerable.',
      'Breaking the sound barrier.',
      'Aurora',
      wiki('Aurora'),
    ),
    genevo(
      5,
      'china',
      'Dragon Fire-Wall',
      'Dragon Tanks have a Fire-Wall ability. Activate it for their area flame attack.',
      'Where should I unleash the dragon?',
      'Dragon Tank',
      wiki('Dragon_tank_(Generals_1)'),
    ),
    genevo(
      6,
      'china',
      'ECM stance',
      'ECM Tanks jam ballistic missiles. They do not automatically engage targets unless set to Aggressive stance.',
      'Frequency jammers on standby.',
      'ECM Tank',
      wiki('ECM_tank'),
    ),
    genevo(
      7,
      'gla',
      'Worker mine clearing',
      'GLA Workers trained at the Barracks clear mines. Keep one available for mined routes.',
      'Can I have some shoes?',
      'GLA Worker',
      wiki('Worker_(Generals_1)'),
    ),
    genevo(
      8,
      'gla',
      'Radar Van jammer',
      'GenEvo Radar Vans have a toggleable jammer that hides nearby allied units. Remember to activate it.',
      'Get me out of sight.',
      'Radar Van',
      wiki('Radar_van_(Generals_1)'),
    ),
    genevo(
      9,
      'gla',
      'SCUD salvage',
      'SCUD Launchers gain upgrades from scrap. Collect salvage rather than leaving it unused.',
      'Look at my beautiful weapon!',
      'SCUD Launcher',
      wiki('SCUD_launcher'),
    ),
  ],
};
function unsupportedText(value: string, multiline = false): boolean {
  return (
    value.includes('\u2014') ||
    [...value].some((char) => {
      const code = char.charCodeAt(0);
      return code < 32 && !(multiline && [9, 10, 13].includes(code));
    })
  );
}
export function validateTip(input: Tip): Tip {
  if (
    !input ||
    !Object.hasOwn(TIP_FACTIONS, input.game) ||
    !Number.isSafeInteger(input.id) ||
    input.id < 1 ||
    input.id > 999999999 ||
    !Object.hasOwn(TIP_FACTIONS[input.game], input.faction)
  )
    throw new Error('Choose a valid game and faction.');
  for (const [value, max] of [
    [input.title, 80],
    [input.text, 1200],
    [input.ruleset, 80],
  ] as const) {
    if (
      typeof value !== 'string' ||
      !value.trim() ||
      value.length > max ||
      unsupportedText(value, true)
    )
      throw new Error('Use plain text within the field limits and hyphens instead of long dashes.');
  }
  validateSource(input.source);
  if (input.quote) {
    const q = input.quote;
    if (
      typeof q.text !== 'string' ||
      !q.text.trim() ||
      q.text.length > 180 ||
      typeof q.speaker !== 'string' ||
      !q.speaker.trim() ||
      q.speaker.length > 80 ||
      unsupportedText(q.text + q.speaker) ||
      q.game !== (input.game === 'ra3' ? 'Red Alert 3' : 'Generals / Zero Hour')
    )
      throw new Error('Use a short quote with its speaker and correct original game.');
    validateSource(q.source);
  }
  if (input.origin !== 'curated' && input.origin !== 'server')
    throw new Error('Invalid tip origin.');
  return input;
}
export function validateSource(value: string): void {
  if (typeof value !== 'string' || value.length > 500 || /\s/.test(value))
    throw new Error('Add a valid HTTPS source link.');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Add a valid HTTPS source link.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    !url.hostname.includes('.') ||
    url.hostname === 'localhost' ||
    url.hostname.endsWith('.localhost') ||
    url.hostname.endsWith('.local') ||
    !/^[a-z0-9.-]+$/i.test(url.hostname) ||
    /^[\d.]+$/.test(url.hostname)
  )
    throw new Error('Use a public HTTPS source link without login details.');
}
