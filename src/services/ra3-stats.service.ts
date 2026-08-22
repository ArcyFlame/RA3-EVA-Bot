import axios from 'axios';
import { logger } from '../utils/logger';
import { db } from '../database/sqlite';
import { masterRepository } from '../repositories/master.repository';

export interface RA3Stats {
  online_now: number;
  cnc_online: number;
  cnc_active_games: number;
  ra3battle_online: number;
  ra3battle_active_games: number;
  peak_24h: number;
  online_last_24h: Array<number | null>;
  online_last_30d: Array<number | null>;
  new_players_last_30d: Array<number | null>;
  history_started_at?: string;
  new_player_tracking_started_at?: string;
  faction_distribution: { Allies: number; Soviets: number; Empire: number };
  top_maps: Array<[string, number]>;
  cnc_recent_matches: Array<{ players: string; map: string; platform: string }>;
  ra3battle_recent_matches: Array<{ players: string; map: string; platform: string }>;
  cnc_ladders: Record<string, Array<[string, number, string]>>;
  ra3b_ladders: Record<string, Array<{ personaName: string; elo: number; primaryFaction: string }>>;
  tournament_wins: Record<string, number>;
  ra3b_season?: { chineseName?: string; englishName?: string };
  masters: Array<{ name: string; year: number; patch?: string }>;
}

/** One ladder row of a RA3BattleNet persona (from /api/stats/persona/{id}/ra3/result). */
export interface Ra3bPersonaLadder {
  rank: number;
  elo: number;
  eloDelta: number;
  prevRank: number;
  wins: number;
  losses: number;
  placementMatchesLeft: number;
  isSelectedForLadders: boolean;
  primaryFaction: string;
  secondaryFaction: string;
  updateTime?: string;
}

export interface Ra3bPersonaStats {
  personaId: number;
  personaName: string;
  ladder1v1: Ra3bPersonaLadder | null;
  ladder2v2: Ra3bPersonaLadder | null;
  ladder3v3: Ra3bPersonaLadder | null;
}

/** A finished season placement (from /api/stats/persona/{id}/ra3/history). */
export interface Ra3bSeasonHistory {
  seasonId: number;
  seasonNameEnglish?: string;
  seasonNameChinese?: string;
  ladderType: string;
  endElo: number;
  endRank: number;
}

/** A ladder entry used for name → personaId resolution. */
export interface Ra3bLadderEntry {
  personaId: number;
  personaName: string;
  elo: number;
  rank: number;
  wins: number;
  losses: number;
  primaryFaction: string;
}

interface CncLiveData {
  ok: boolean;
  players: number;
  activeGames: number;
  mapCounts: Record<string, number>;
  recentMatches: Array<{ players: string; map: string; platform: string }>;
}

interface Ra3bLiveData {
  ok: boolean;
  players: number;
  rooms: number;
  mapCounts: Record<string, number>;
  recentMatches: Array<{ players: string; map: string; platform: string }>;
}

// Friendly map name mapping (same as Python)
const MAP_FRIENDLY_NAMES: Record<string, string> = {
  feasel1: 'Fire Island',
  feasel2: 'Carville',
  feasel4: 'Deep Cold',
  feasel5: 'Heidelberg',
  feasel6: 'Yokohama',
  feasel8: 'Infinity Isle',
  rao1: 'Misty Abyss',
  temple_legend: 'Temple Prime',
  spring_walker: 'Spring Walker',
  chrysoberyl_garden: 'Libration Freeze (Chrysoberyl Garden)',
  liberation_freeze: 'Libration Freeze (Chrysoberyl Garden)',
  libration_freeze: 'Libration Freeze (Chrysoberyl Garden)',
  aquae_caerulea: 'Battlebase Epsilon (Aquae Caerulea)',
  battlebase_epsilon: 'Battlebase Epsilon (Aquae Caerulea)',
  tank_crash: 'Tank Crash',
  redemption_base: 'Redemption Base',
  snow_plow: 'Snow Plow',
  sub_zero: 'Sub-Zero Hour',
  secret_shrine: 'Secret Shrine',
  hostile_hostel: 'Hostile Hostel',
  cabana_republic: 'Cabana Republic',
  hammer_beach: 'Hammer Beach',
  remo_crossing: 'Remo Crossing',
  pacifica_paradise: 'Pacific Paradise',
  scorching_sands: 'Scorching Sands',
  thermal_tension: 'Thermal Tension',
  erebor_lament: 'Erebor Lament',
  battlebase_alpha: 'Battlebase Alpha',
  battlebase_beta: 'Battlebase Beta',
  deep_cold: 'Deep Cold',
  grinderberg: 'Grinderberg',
  isla_pascua: 'Isla Pascua',
  lake_albatross: 'Lake of Albatross',
  misty_abyss: 'Misty Abyss',
  tournament_tower: 'Tournament Tower',
  wasteland: 'Wasteland',
  mountrushmore: 'Mount Rushmore',
  mykonos: 'Mykonos',
  north_sea: 'North Sea',
  new_york_city: 'New York City',
  pearl_harbor: 'Pearl Harbor',
  magmageddon: 'Magmageddon',
  hidden_fortress: 'Hidden Fortress',
  fried_river: 'Fried River',
  fire_island: 'Fire Island',
  emerald_canyon: 'Emerald Canyon',
  serenity_gardens: 'Serenity Gardens',
};

export function cleanMapName(rawName: string): string {
  let name = rawName.replace(/\\/g, '/').split('/').pop()?.replace('.map', '') || rawName;
  name = name
    .replace(/ra3bn_/g, '')
    .replace(/map_mp_2_/g, '')
    .replace(/map_mp_1_/g, '')
    .replace(/map_mp_3_/g, '');
  name = name.trim().toLowerCase();
  for (const [key, friendly] of Object.entries(MAP_FRIENDLY_NAMES)) {
    if (name.includes(key)) return friendly;
  }
  name = name.replace(/[_\-\s]+/g, ' ').trim();
  return name.charAt(0).toUpperCase() + name.slice(1) || 'Unknown';
}

export function isSkirmishMap(mapName: string): boolean {  const lower = mapName.toLowerCase();
  const campaign = [
    // RA3 base campaign missions
    'stalingrad',
    'krasna-45',
    'vladivostok',
    'von esling airbase',
    'mt. fuji',
    'easter island',
    'cannes',
    'copenhagen',
    'gibraltar',
    'havana',
    'yucatán',
    'leningrad',
    'vorkuta',
    'odessa',
    'pacific ocean',
    'santa monica',
    'moscow',
    'amsterdam',
    'brighton beach',
    'rome',
    'tuscany',
    'nordlingen',
    'osaka',
    'sagami',
    'shin-tokyo',
    'casablanca',
    'tokyo harbor',
    // Uprising campaign missions
    'mechanical force',
    'pilgrimages end',
    'graceful greed',
    'the science of war',
    'the git done',
    'shadows and silence',
    'shatter the silence',
    'bloody mess',
    'school of hard knocks',
    'dangerous ground',
    'sudden impact',
    'traitor of the people',
    'end of the beginning',
    'beginning of the end',
    'fisher of men',
    'stone cold crazy',
    'king of the hill',
    'with enemies like these',
    // Co-op / campaign / generic
    'coop',
    'co-op',
    'co op',
    'tutorial',
    'prologue',
    'camp',
    'campaign',
    'mission',
  ];
  return !campaign.some((kw) => lower.includes(kw));
}

/**
 * Allowlist of genuine RA3 skirmish maps (official + competitive pool).
 * A denylist can't catch maps from unrelated mods (Genevo, Sgor00, Skrm 22b
 * are played through the same clients), so stats and lobbies only count
 * maps that are actually Red Alert 3.
 */
const KNOWN_SKIRMISH_MAPS: string[] = [
  ...Object.values(MAP_FRIENDLY_NAMES),
  // Same-layout aliases: bare component names must still match when topic
  // text or a platform spells only one of the two names.
  'Chrysoberyl Garden',
  'Libration Freeze',
  'Battlebase Epsilon',
  'Aquae Caerulea',
  // Competitive pool (as used by /pickmap)
  'Battlebase Delta',
  'Grinderberg',
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
  'Erebor Lament',
  'Infinity Isle',
  'Deep Cold',
  'Battlebase Alpha',
  // Other common official/custom skirmish maps seen on the ladder
  'Fire Island',
  'Heidelberg',
  'Yokohama',
  'Carville',
  'Temple Prime',
  'Battlebase Beta',
  'Corrupted Grounds',
  'Infected Isle',
  'Bread Basket',
  'Icebreaker',
  'Double Barreled',
  'Ridge Grid',
  'Industrial Strength',
  'Aguada Boulevard',
  'Pirate Bay',
  'Border Zone',
  'Rippling Waters',
  'Twin Peaks',
  'Cliffside Manor',
  'Ruined Village',
  'Battle in the Barents Sea',
  'Arctic Barents Sea',
];

const KNOWN_MAP_KEYS = KNOWN_SKIRMISH_MAPS.map((m) => m.toLowerCase().replace(/[^a-z0-9]/g, ''));

/** True only for maps on the RA3 allowlist (official + competitive + ladder). */
export function isKnownSkirmishMap(displayName: string): boolean {
  const norm = displayName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (norm.length < 3) return false;
  for (const key of KNOWN_MAP_KEYS) {
    if (norm === key) return true;
    // Names often carry suffixes ("Grinderberg 2") or trim oddly.
    if (norm.length >= 5 && (norm.startsWith(key) || key.startsWith(norm))) return true;
  }
  return false;
}

/** Read access to the allowlist (used by the tournament scanner for map pools). */
export function knownSkirmishMapNames(): string[] {
  return [...KNOWN_SKIRMISH_MAPS];
}

export class RA3StatsService {
  private cache: RA3Stats | null = null;
  private cacheTime = 0;
  private readonly cacheTTL = 5 * 60 * 1000; // 5 minutes
  private lastSnapshotAt = 0;
  private readonly snapshotInterval = 10 * 60 * 1000; // persist a snapshot every 10 min
  private lastCncData: CncLiveData | null = null;
  private lastRa3bData: Ra3bLiveData | null = null;

  async fetch(): Promise<RA3Stats> {
    if (this.cache && Date.now() - this.cacheTime < this.cacheTTL) return this.cache;
    logger.info('Fetching fresh RA3 stats...');

    // Fetch all data in parallel
    const [cncData, ra3bData, ra3bLadders, factionData, mapData, seasonData] =
      await Promise.allSettled([
        this.fetchCnCOnline(),
        this.fetchRA3BattleNet(),
        this.fetchRA3BattleNetLadders(),
        this.fetchFactionDistribution(),
        this.fetchRA3BattleNetMaps(),
        this.fetchCurrentSeason(),
      ]);

    const cncLive =
      cncData.status === 'fulfilled'
        ? cncData.value
        : { ok: false, players: 0, activeGames: 0, mapCounts: {}, recentMatches: [] };
    const ra3bLive =
      ra3bData.status === 'fulfilled'
        ? ra3bData.value
        : { ok: false, players: 0, rooms: 0, mapCounts: {}, recentMatches: [] };
    if (cncLive.ok) this.lastCncData = cncLive;
    if (ra3bLive.ok) this.lastRa3bData = ra3bLive;
    const cnc = cncLive.ok ? cncLive : this.lastCncData ?? cncLive;
    const ra3b = ra3bLive.ok ? ra3bLive : this.lastRa3bData ?? ra3bLive;
    const completeSample = cncLive.ok && ra3bLive.ok;
    const ra3bLaddersVal =
      ra3bLadders.status === 'fulfilled' ? ra3bLadders.value : { '1v1': [], '2v2': [], '3v3': [], '4v4': [] };
    const factions =
      factionData.status === 'fulfilled'
        ? factionData.value
        : { Allies: 30, Soviets: 35, Empire: 35 };
    const ra3bMaps = mapData.status === 'fulfilled' ? mapData.value : {};
    const season = seasonData.status === 'fulfilled' ? seasonData.value : undefined;

    // Combine map counts from both platforms (only known RA3 skirmish maps)
    const combinedMapCounts: Record<string, number> = {};
    for (const [map, count] of Object.entries(cnc.mapCounts)) {
      if (isKnownSkirmishMap(map)) combinedMapCounts[map] = (combinedMapCounts[map] || 0) + count;
    }
    for (const [map, count] of Object.entries(ra3bMaps)) {
      if (isKnownSkirmishMap(map)) combinedMapCounts[map] = (combinedMapCounts[map] || 0) + count;
    }
    const topMaps = Object.entries(combinedMapCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10) as Array<[string, number]>;

    const onlineNow = cnc.players + ra3b.players;

    // Real history from the stats_snapshots the bot persists every 10 min.
    // Missing buckets stay null so a short tracking window is never presented
    // as a full day or month of repeated measurements.
    const history24 = this.getRecentHistory(24);
    const currentPoint = completeSample ? [{ at: Date.now(), v: onlineNow }] : [];
    const onlineLast24h = this.bucketHistory(
      history24
        .map((r) => ({ at: this.parseSnapshotTime(r.created_at), v: r.online_now }))
        .concat(currentPoint),
      24,
      3_600_000,
    );
    const peakValues = history24.map((r) => r.online_now);
    if (completeSample) peakValues.push(onlineNow);
    const peak24h = peakValues.length > 0 ? Math.max(...peakValues) : onlineNow;
    const history30 = this.getRecentHistory(24 * 30);
    const onlineLast30d = this.bucketHistory(
      history30
        .map((r) => ({ at: this.parseSnapshotTime(r.created_at), v: r.online_now }))
        .concat(currentPoint),
      30,
      86_400_000,
    );
    // New players per day: personas whose first ladder appearance was that
    // day (tracked since the bot started watching the ladders).
    await this.trackSeenPlayers();
    const newPlayersLast30d = this.newPlayersByDay();
    const tournamentWins = this.getTournamentWins();
    const masters = this.getMasters();

    // C&C Online exposes no public ladder API — the Top 10 page says so
    // instead of showing invented numbers. RA3BattleNet ladders are real.
    const cncLadders: Record<string, [string, number, string][]> = {
      '1v1': [],
      '2v2': [],
      '3v3': [],
      '4v4': [],
    };

    const stats: RA3Stats = {
      online_now: onlineNow,
      cnc_online: cnc.players,
      cnc_active_games: cnc.activeGames,
      ra3battle_online: ra3b.players,
      ra3battle_active_games: ra3b.rooms,
      peak_24h: peak24h,
      online_last_24h: onlineLast24h,
      online_last_30d: onlineLast30d,
      new_players_last_30d: newPlayersLast30d,
      history_started_at: history30[0]?.created_at,
      new_player_tracking_started_at: this.getTrackingStart(),
      faction_distribution: factions,
      top_maps: topMaps,
      cnc_recent_matches: cnc.recentMatches,
      ra3battle_recent_matches: ra3b.recentMatches,
      cnc_ladders: cncLadders,
      ra3b_ladders: ra3bLaddersVal,
      tournament_wins: tournamentWins,
      ra3b_season: season,
      masters: masters,
    };

    this.cache = stats;
    this.cacheTime = Date.now();

    // Persist a snapshot every snapshotInterval so refresh can show history.
    const now = Date.now();
    if (completeSample && now - this.lastSnapshotAt >= this.snapshotInterval) {
      this.lastSnapshotAt = now;
      try {
        this.snapshotStats(stats);
      } catch (err) {
        logger.warn('Failed to persist RA3 stats snapshot:', err);
      }
    } else if (!completeSample) {
      logger.warn('Skipping stats snapshot because one or more player-count APIs failed');
    }

    return stats;
  }

  private snapshotStats(stats: RA3Stats): void {
    // Top players per platform (1v1 ladder, top 10) so history remembers who was on top.
    const topPlayers = {
      cnc: (stats.cnc_ladders['1v1'] || []).slice(0, 10).map((r) => r[0]),
      ra3b: (stats.ra3b_ladders['1v1'] || []).slice(0, 10).map((r) => r.personaName),
    };
    db.prepare(
      'INSERT INTO stats_snapshots (online_now, cnc_online, ra3battle_online, faction_distribution, top_maps, top_players) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(
      stats.online_now, stats.cnc_online, stats.ra3battle_online,
      JSON.stringify(stats.faction_distribution),
      JSON.stringify(stats.top_maps),
      JSON.stringify(topPlayers),
    );
    // Keep the last 30 days of snapshots.
    db.prepare("DELETE FROM stats_snapshots WHERE created_at < datetime('now', '-30 days')").run();
  }

  /** Recent history (default: last 24h) for refresh/next, oldest first. */
  getRecentHistory(hours = 24): Array<{ created_at: string; online_now: number; cnc_online: number; ra3battle_online: number; faction_distribution: string; top_maps: string; top_players: string }> {
    try {
      return db
        .prepare("SELECT created_at, online_now, cnc_online, ra3battle_online, faction_distribution, top_maps, top_players FROM stats_snapshots WHERE created_at >= datetime('now', ?) ORDER BY created_at ASC")
        .all('-' + hours + ' hours') as any[];
    } catch {
      return [];
    }
  }

  /** SQLite CURRENT_TIMESTAMP ("YYYY-MM-DD HH:MM:SS", UTC) → epoch ms. */
  private parseSnapshotTime(created: string): number {
    return new Date(created.replace(' ', 'T') + 'Z').getTime() || 0;
  }

  private lastSeenTrackAt = 0;

  /**
   * Records every ladder persona with its first-seen day (feeds the New
   * Players chart). Runs at most once per 10 minutes.
   */
  private async trackSeenPlayers(): Promise<void> {
    if (Date.now() - this.lastSeenTrackAt < this.personaCacheTTL) return;
    this.lastSeenTrackAt = Date.now();
    try {
      const existing = db.prepare('SELECT COUNT(*) AS n FROM ra3b_seen_players').get() as {
        n: number;
      };
      const isBaseline = existing.n === 0;
      const insert = db.prepare(
        `INSERT OR IGNORE INTO ra3b_seen_players
           (persona_id, persona_name, first_seen, is_baseline)
         VALUES (?, ?, date('now'), ?)`,
      );
      const tx = db.transaction(() => {
        for (const mode of ['1v1', '2v2', '3v3'] as const) {
          for (const entry of this.laddersCache.get(mode) ?? []) {
            insert.run(entry.personaId, entry.personaName, isBaseline ? 1 : 0);
          }
        }
      });
      // Make sure the ladders are actually populated before recording.
      for (const mode of ['1v1', '2v2', '3v3'] as const) {
        await this.getRa3bLadder(mode);
      }
      tx();
      db.prepare(
        `INSERT OR IGNORE INTO stats_tracking_meta (key, value)
         VALUES ('new_players_started_at', date('now'))`,
      ).run();
    } catch (error) {
      logger.warn('Seen-player tracking failed:', error);
    }
  }

  /** New players per day over the last 30 days, oldest first. */
  private newPlayersByDay(): Array<number | null> {
    try {
      const rows = db
        .prepare(
          "SELECT first_seen, COUNT(*) as n FROM ra3b_seen_players WHERE is_baseline = 0 AND first_seen >= date('now', '-29 days') GROUP BY first_seen",
        )
        .all() as Array<{ first_seen: string; n: number }>;
      const byDate = new Map(rows.map((r) => [r.first_seen, r.n]));
      const trackingStart = this.getTrackingStart();
      const out: Array<number | null> = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
        out.push(trackingStart && d >= trackingStart ? byDate.get(d) ?? 0 : null);
      }
      return out;
    } catch {
      return new Array(30).fill(null);
    }
  }

  private getTrackingStart(): string | undefined {
    try {
      const row = db
        .prepare("SELECT value FROM stats_tracking_meta WHERE key = 'new_players_started_at'")
        .get() as { value: string } | undefined;
      return row?.value;
    } catch {
      return undefined;
    }
  }

  /**
   * Buckets snapshot points into `count` time buckets ending now (oldest
   * first, MAX value per bucket). A null bucket means there was no valid
   * complete sample in that interval.
   */
  private bucketHistory(
    points: Array<{ at: number; v: number }>,
    count: number,
    bucketMs: number,
  ): Array<number | null> {
    const now = Date.now();
    const out: Array<number | null> = new Array(count).fill(null);
    for (const p of points) {
      if (!p.at) continue;
      const age = now - p.at;
      if (age < 0 || age >= count * bucketMs) continue;
      const idx = count - 1 - Math.floor(age / bucketMs);
      if (idx < 0 || idx >= count) continue;
      out[idx] = out[idx] === null ? p.v : Math.max(out[idx]!, p.v);
    }
    return out;
  }

  /**
   * Looks up a player on the RA3BattleNet ladders (all modes, cached stats).
   * Used by /profile to show live elo with its own RA3BattleNet label.
   */
  async findRA3BattleNetPlayer(
    name: string,
  ): Promise<{ personaName: string; elo: number; primaryFaction: string; mode: string } | null> {
    const stats = await this.fetch();
    const needle = name.toLowerCase();
    for (const mode of ['1v1', '2v2', '3v3', '4v4'] as const) {
      const ladder = stats.ra3b_ladders[mode] || [];
      const hit = ladder.find((p) => p.personaName.toLowerCase() === needle);
      if (hit) return { ...hit, mode };
    }
    return null;
  }

  // ------------------------------------------------------------------
  // RA3BattleNet persona profiles (per-player W/L, elo, seasons)
  // ------------------------------------------------------------------

  /** personaName (lowercase) → personaId, collected from the ladder pages. */
  private personaIdCache = new Map<string, number>();
  private personaIdCacheAt = 0;
  private readonly personaCacheTTL = 10 * 60 * 1000;
  private laddersCache = new Map<string, Ra3bLadderEntry[]>();

  /**
   * A ladder's full entry list (every page — the API pages by 100 with a
   * total field). Also refreshes the name → personaId cache used for
   * profile lookups.
   */
  async getRa3bLadder(mode: '1v1' | '2v2' | '3v3'): Promise<Ra3bLadderEntry[]> {
    const cached = this.laddersCache.get(mode);
    if (cached && Date.now() - this.personaIdCacheAt < this.personaCacheTTL) return cached;
    const entries: Ra3bLadderEntry[] = [];
    for (let page = 1; page <= 20; page++) {
      try {
        const res = await axios.get(
          `https://api.ra3battle.cn/api/stats/ladder/ra3/${mode}/records/page/${page}/result`,
          { timeout: 5000 },
        );
        const records: any[] = res.data.records || [];
        for (const r of records) {
          entries.push({
            personaId: r.personaId,
            personaName: r.personaName || 'Unknown',
            elo: r.elo ?? 0,
            rank: r.rank ?? 0,
            wins: r.wins ?? 0,
            losses: r.losses ?? 0,
            primaryFaction: r.primaryFaction || 'Unknown',
          });
        }
        if (records.length < 100 || entries.length >= (res.data.total ?? Infinity)) break;
      } catch (error) {
        logger.warn(`RA3BattleNet ladder walk failed for ${mode} page ${page}:`, error);
        break;
      }
    }
    if (entries.length > 0) {
      this.laddersCache.set(mode, entries);
      this.personaIdCacheAt = Date.now();
      for (const e of entries) this.personaIdCache.set(e.personaName.toLowerCase(), e.personaId);
    }
    return entries;
  }

  /** Resolves a persona name to its RA3BattleNet persona id (any ladder). */
  async findRa3bPersonaId(name: string): Promise<number | null> {
    const needle = name.toLowerCase().trim();
    const cached = this.personaIdCache.get(needle);
    if (cached) return cached;
    if (Date.now() - this.personaIdCacheAt < this.personaCacheTTL) return null; // cache fresh, truly unknown
    for (const mode of ['1v1', '2v2', '3v3'] as const) {
      await this.getRa3bLadder(mode);
      const hit = this.personaIdCache.get(needle);
      if (hit) return hit;
    }
    return null;
  }

  /** Live per-ladder stats of one persona (elo, rank, W/L, factions). */
  async getRa3bPersonaStats(personaId: number): Promise<Ra3bPersonaStats | null> {
    try {
      const res = await axios.get(
        `https://api.ra3battle.cn/api/stats/persona/${personaId}/ra3/result`,
        { timeout: 5000 },
      );
      return {
        personaId,
        personaName: res.data.personaName || 'Unknown',
        ladder1v1: res.data.ladder1v1 ?? null,
        ladder2v2: res.data.ladder2v2 ?? null,
        ladder3v3: res.data.ladder3v3 ?? null,
      };
    } catch (error) {
      logger.warn(`RA3BattleNet persona stats failed for ${personaId}:`, error);
      return null;
    }
  }

  /** Finished-season placements of one persona (end elo + rank per ladder). */
  async getRa3bPersonaHistory(personaId: number): Promise<Ra3bSeasonHistory[]> {
    try {
      const res = await axios.get(
        `https://api.ra3battle.cn/api/stats/persona/${personaId}/ra3/history`,
        { timeout: 5000 },
      );
      return (Array.isArray(res.data) ? res.data : []).map((h: any) => ({
        seasonId: h.seasonId,
        seasonNameEnglish: h.seasonNameEnglish,
        seasonNameChinese: h.seasonNameChinese,
        ladderType: h.ladderType,
        endElo: h.endElo,
        endRank: h.endRank,
      }));
    } catch (error) {
      logger.warn(`RA3BattleNet persona history failed for ${personaId}:`, error);
      return [];
    }
  }

  // ------------------------------------------------------------------
  // C&C Online API
  // ------------------------------------------------------------------
  private async fetchCnCOnline(): Promise<CncLiveData> {
    try {
      const res = await axios.get('https://cnc-online.net/api/serverinfo/?site=cnconline', {
        timeout: 5000,
      });
      const ra3 = res.data.ra3 || {};
      const users = ra3.users || {};
      const gamesPlaying = ra3.games?.playing || [];
      const gamesStaging = ra3.games?.staging || [];
      const lobbiesHosting = ra3.lobbies?.hosting || 0;

      const playersOnline = Object.keys(users).length;
      const activeGames = gamesPlaying.length + gamesStaging.length + lobbiesHosting;

      const mapCounts: Record<string, number> = {};
      const allGames = [...gamesPlaying, ...gamesStaging];
      for (const game of allGames) {
        let map = game.map || 'Unknown';
        map = map.split('.map')[0];
        map = map
          .replace(/\[.*?\]/g, '')
          .replace(/[_\-\s]+/g, ' ')
          .trim();
        if (map && isKnownSkirmishMap(map)) {
          mapCounts[map] = (mapCounts[map] || 0) + 1;
        }
      }

      const recentMatches: Array<{ players: string; map: string; platform: string }> = [];
      for (const game of [...gamesPlaying, ...gamesStaging].slice(0, 10)) {
        let players: string[] = [];
        if (Array.isArray(game.players)) {
          players = game.players.map((p: any) => p.nickname || 'Unknown');
        } else if (game.players && typeof game.players === 'object') {
          players = Object.values(game.players).map((p: any) => p.nickname || 'Unknown');
        }
        if (players.length === 0) continue;
        const playersStr = players.join(', ');
        let map = game.map || 'Unknown';
        map = map.split('.map')[0];
        map =
          map
            .replace(/\[.*?\]/g, '')
            .replace(/[_\-\s]+/g, ' ')
            .trim() || 'Unknown';
        // Only genuine RA3 skirmish games — no co-op, campaign or mod lobbies.
        if (!isKnownSkirmishMap(map)) continue;
        recentMatches.push({ players: playersStr, map, platform: 'C&C Online' });
        if (recentMatches.length >= 5) break;
      }

      return { ok: true, players: playersOnline, activeGames, mapCounts, recentMatches };
    } catch (error) {
      logger.warn('C&C Online API failed:', error);
      return { ok: false, players: 0, activeGames: 0, mapCounts: {}, recentMatches: [] };
    }
  }

  // ------------------------------------------------------------------
  // RA3BattleNet API
  // ------------------------------------------------------------------
  private async fetchRA3BattleNet(): Promise<Ra3bLiveData> {
    try {
      const res = await axios.get('https://api.ra3battle.cn/api/server/status/detail', {
        timeout: 5000,
      });
      const players = res.data.players?.length || 0;
      const games = res.data.games || [];
      const rooms = games.length;
      const mapCounts: Record<string, number> = {};
      const recentMatches: Array<{ players: string; map: string; platform: string }> = [];
      for (const game of games.slice(0, 10)) {
        let playersList: string[] = [];
        if (Array.isArray(game.players)) {
          playersList = game.players.map((p: any) => p.name || 'Unknown');
        } else if (game.players && typeof game.players === 'object') {
          playersList = Object.values(game.players).map((p: any) => p.name || 'Unknown');
        }
        if (playersList.length === 0) continue;
        const playersStr = playersList.join(', ');
        let map = game.mapname || 'Unknown';
        map = cleanMapName(map);
        // Only genuine RA3 skirmish games — no co-op, campaign or mod lobbies.
        if (!isKnownSkirmishMap(map)) continue;
        mapCounts[map] = (mapCounts[map] || 0) + 1;
        if (recentMatches.length < 5) {
          recentMatches.push({ players: playersStr, map, platform: 'RA3BattleNet' });
        }
      }
      return { ok: true, players, rooms, mapCounts, recentMatches };
    } catch (error) {
      logger.warn('RA3BattleNet status API failed:', error);
      return { ok: false, players: 0, rooms: 0, mapCounts: {}, recentMatches: [] };
    }
  }

  private async fetchRA3BattleNetLadders(): Promise<
    Record<string, Array<{ personaName: string; elo: number; primaryFaction: string }>>
  > {
    const modes = ['1v1', '2v2', '3v3', '4v4'];
    const result: Record<string, any[]> = { '1v1': [], '2v2': [], '3v3': [], '4v4': [] };
    for (const mode of modes) {
      try {
        const url = `https://api.ra3battle.cn/api/stats/ladder/ra3/${mode}/records/page/1/result`;
        const res = await axios.get(url, { timeout: 5000 });
        const records = res.data.records || [];
        result[mode] = records.slice(0, 10).map((r: any) => ({
          personaName: r.personaName || 'Unknown',
          elo: r.elo || 0,
          primaryFaction: r.primaryFaction || 'Random',
        }));
      } catch (error) {
        logger.warn(`Failed to fetch RA3BattleNet ladder for ${mode}:`, error);
        result[mode] = [];
      }
    }
    return result;
  }

  private async fetchFactionDistribution(): Promise<{
    Allies: number;
    Soviets: number;
    Empire: number;
  }> {
    try {
      const res = await axios.get('https://api.ra3battle.cn/api/stats/1v1/factions/ra3/2', {
        timeout: 5000,
      });
      // The faction totals sit under byModFullName, not the top level.
      const totalOf = (faction: any): number => {
        if (!faction || typeof faction !== 'object') return 0;
        let total = 0;
        for (const mod of Object.values(faction.byModFullName ?? {})) {
          if (mod && typeof mod === 'object' && 'total' in mod) total += (mod as any).total || 0;
        }
        return total;
      };
      return {
        Allies: totalOf(res.data.Allied),
        Soviets: totalOf(res.data.Soviet),
        Empire: totalOf(res.data.Empire),
      };
    } catch (error) {
      logger.warn('Failed to fetch faction distribution:', error);
      return { Allies: 0, Soviets: 0, Empire: 0 };
    }
  }

  private async fetchRA3BattleNetMaps(): Promise<Record<string, number>> {
    try {
      const res = await axios.get('https://api.ra3battle.cn/api/stats/1v1/maps/ra3/2', {
        timeout: 5000,
      });
      const mapCounts: Record<string, number> = {};
      for (const entry of res.data) {
        const mapPath = entry.map || '';
        const mapName = cleanMapName(mapPath);
        let total = 0;
        for (const stats of Object.values(entry.stats || {})) {
          if (stats && typeof stats === 'object' && 'total' in stats) {
            total += (stats as any).total || 0;
          }
        }
        if (total > 0 && isKnownSkirmishMap(mapName)) {
          mapCounts[mapName] = (mapCounts[mapName] || 0) + total;
        }
      }
      return mapCounts;
    } catch (error) {
      logger.warn('Failed to fetch RA3BattleNet maps:', error);
      return {};
    }
  }

  private async fetchCurrentSeason(): Promise<
    { chineseName?: string; englishName?: string } | undefined
  > {
    try {
      const res = await axios.get('https://api.ra3battle.cn/api/stats/season/current/result', {
        timeout: 5000,
      });
      return res.data;
    } catch {
      return undefined;
    }
  }

  // ------------------------------------------------------------------
  // Hall of fame data (masters) + tournament winners
  // ------------------------------------------------------------------
  private getTournamentWins(): Record<string, number> {
    try {
      const rows = db
        .prepare(
          "SELECT winner_name, winner_key FROM tournament_winners WHERE game = 'ra3' ORDER BY recorded_at ASC",
        )
        .all() as Array<{ winner_name: string; winner_key: string | null }>;
      const aliases = new Map(
        (
          db
            .prepare('SELECT alias_key, canonical_name FROM tournament_player_aliases')
            .all() as Array<{ alias_key: string; canonical_name: string }>
        ).map((row) => [row.alias_key, row.canonical_name]),
      );
      const grouped = new Map<string, { name: string; wins: number }>();
      for (const row of rows) {
        const key = (row.winner_key || row.winner_name).trim().toLocaleLowerCase('en-US');
        const displayName = aliases.get(key) ?? row.winner_name.trim();
        const canonicalKey = displayName.toLocaleLowerCase('en-US');
        const current = grouped.get(canonicalKey);
        grouped.set(canonicalKey, {
          name: current?.name ?? displayName,
          wins: (current?.wins ?? 0) + 1,
        });
      }
      const wins: Record<string, number> = {};
      for (const row of grouped.values()) wins[row.name] = row.wins;
      return wins;
    } catch (error) {
      logger.warn('Failed to fetch tournament wins:', error);
      return {};
    }
  }

  private getMasters(): Array<{ name: string; year: number; patch?: string }> {
    try {
      return masterRepository.getAll().map((m) => ({ name: m.name, year: m.year, patch: m.patch }));
    } catch (error) {
      logger.warn('Failed to fetch masters:', error);
      return [];
    }
  }
}

export const ra3StatsService = new RA3StatsService();
