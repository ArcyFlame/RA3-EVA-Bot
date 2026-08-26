export type GameId = 'ra3' | 'genevo';

export interface GameConfig {
  id: GameId;
  label: string;
  shortLabel: string;
  emoji: string;
  color: number;
  artworkUrl: string;
  description: string;
  supportsRa3BattleNet: boolean;
  tournamentFallbackUrl: string;
  newsLabel: string;
  moddbArticlesUrl: string;
  moddbDownloadsUrl: string;
  moddbModsUrl: string;
}

export const GAME_CONFIGS: Record<GameId, GameConfig> = {
  ra3: {
    id: 'ra3',
    label: 'Command & Conquer: Red Alert 3',
    shortLabel: 'Red Alert 3',
    emoji: '🔻',
    color: 0x9f1d20,
    artworkUrl:
      'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/17480/header.jpg',
    description: 'Red Alert 3 multiplayer on C&C Online and RA3BattleNet.',
    supportsRa3BattleNet: true,
    tournamentFallbackUrl: 'https://www.gamereplays.org/redalert3/portals.php?show=esports',
    newsLabel: 'GameReplays.org Red Alert 3',
    moddbArticlesUrl: 'https://www.moddb.com/games/cc-red-alert-3/articles',
    moddbDownloadsUrl: 'https://www.moddb.com/games/cc-red-alert-3/downloads',
    moddbModsUrl: 'https://www.moddb.com/games/cc-red-alert-3/mods',
  },
  genevo: {
    id: 'genevo',
    label: 'Command & Conquer: Generals Evolution',
    shortLabel: 'Generals Evolution',
    emoji: '⭐',
    color: 0x3f7d35,
    artworkUrl:
      'https://media.moddb.com/cache/images/articles/1/341/340076/thumb_620x2000/033Art.png',
    description: 'Generals Evolution multiplayer on C&C Online and RA3BattleNet.',
    supportsRa3BattleNet: true,
    tournamentFallbackUrl: 'https://www.moddb.com/mods/command-and-conquer-generals-evolution',
    newsLabel: 'Generals Evolution on ModDB',
    moddbArticlesUrl: 'https://www.moddb.com/mods/command-and-conquer-generals-evolution/articles',
    moddbDownloadsUrl:
      'https://www.moddb.com/mods/command-and-conquer-generals-evolution/downloads',
    moddbModsUrl: 'https://www.moddb.com/mods/command-and-conquer-generals-evolution/addons',
  },
};

export function normalizeGame(value: unknown): GameId {
  return value === 'genevo' ? 'genevo' : 'ra3';
}

export function getGameConfig(value: unknown): GameConfig {
  return GAME_CONFIGS[normalizeGame(value)];
}

const GENEVO_CONTENT = /generals\s*(?::|-)?\s*evolution|gen\s*evo|genevo/i;
const OTHER_GAME_CONTENT =
  /kane'?s wrath|tiberi(?:um|an)|\bc&c\s*3\b|\bzero hour\b|\bgenerals\s*(?:world series|ladder|tournament)\b/i;

/** Classifies mixed C&C feeds without allowing another game's posts through. */
export function classifyGameContent(text: string): GameId | 'other' | 'neutral' {
  if (GENEVO_CONTENT.test(text)) return 'genevo';
  if (OTHER_GAME_CONTENT.test(text)) return 'other';
  return 'neutral';
}

/** Neutral items belong to RA3 when a source itself is RA3-scoped. */
export function matchesGameContent(text: string, game: GameId): boolean {
  const classified = classifyGameContent(text);
  return game === 'genevo'
    ? classified === 'genevo'
    : classified === 'ra3' || classified === 'neutral';
}
