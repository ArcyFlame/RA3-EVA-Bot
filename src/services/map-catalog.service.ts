import { db } from '../database/sqlite';
import { cleanGameMapName, GENEVO_MAP_LABELS, matchesGameLobby } from '../data/game-maps';
import { sourceGet } from '../utils/safe-fetch';

export function mapIdentifier(raw: string): string | undefined {
  const id = raw
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    ?.replace(/\.map$/i, '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
  if (!id || id.length > 128 || !/^[\p{L}\p{N}_.'()[\]-]+$/u.test(id)) return;
  return id;
}

export class MapCatalogService {
  private pending = new Set<string>();
  displayName(raw: string): string {
    const id = mapIdentifier(raw);
    try {
      const row = id
        ? (db
            .prepare(
              "SELECT display_name FROM discovered_maps WHERE game = 'genevo' AND map_id = ?",
            )
            .get(id) as { display_name: string } | undefined)
        : undefined;
      return row?.display_name ?? cleanGameMapName(raw, 'genevo');
    } catch {
      return cleanGameMapName(raw, 'genevo');
    }
  }
  list(): string[] {
    try {
      return (
        db
          .prepare(
            "SELECT display_name FROM discovered_maps WHERE game = 'genevo' ORDER BY display_name LIMIT 500",
          )
          .all() as Array<{ display_name: string }>
      ).map((r) => r.display_name);
    } catch {
      return [];
    }
  }
  async observe(raw: string, mod: string | undefined, source: 'cnc' | 'ra3b'): Promise<void> {
    if (!matchesGameLobby(raw, mod, 'genevo')) return;
    const id = mapIdentifier(raw);
    if (!id) return;
    const row = db
      .prepare(
        "SELECT metadata_checked_at FROM discovered_maps WHERE game = 'genevo' AND map_id = ?",
      )
      .get(id) as { metadata_checked_at: number } | undefined;
    if (
      !row &&
      (db.prepare('SELECT COUNT(*) AS n FROM discovered_maps').get() as { n: number }).n >= 500
    )
      return;
    db.prepare(
      `INSERT INTO discovered_maps(game,map_id,display_name,source) VALUES('genevo',?,?,?)
      ON CONFLICT(game,map_id) DO UPDATE SET last_seen = CURRENT_TIMESTAMP`,
    ).run(id, GENEVO_MAP_LABELS[id] ?? cleanGameMapName(raw, 'genevo'), source);
    if (
      GENEVO_MAP_LABELS[id] ||
      this.pending.has(id) ||
      this.pending.size >= 2 ||
      (row && Date.now() - row.metadata_checked_at < 86400000)
    )
      return;
    this.pending.add(id);
    db.prepare(
      "UPDATE discovered_maps SET metadata_checked_at = ? WHERE game = 'genevo' AND map_id = ?",
    ).run(Date.now(), id);
    try {
      const { data } = await sourceGet(
        `https://api-cn.z31.xyz/v2/maps/precise/?name=${encodeURIComponent(id)}`,
        { timeout: 4000 },
      );
      const label =
        data?.isFound === true
          ? (data.info?.displayName ?? data.info?.mapName ?? data.info?.name)
          : undefined;
      if (
        typeof label === 'string' &&
        label.trim() &&
        label.length <= 100 &&
        !/[<>]/.test(label) &&
        ![...label].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) &&
        mapIdentifier(label) !== id
      )
        db.prepare(
          "UPDATE discovered_maps SET display_name = ? WHERE game = 'genevo' AND map_id = ?",
        ).run(label.trim(), id);
    } catch {
      /* Keep the observed identifier when the metadata service is unavailable. */
    } finally {
      this.pending.delete(id);
    }
  }
}
export const mapCatalogService = new MapCatalogService();
