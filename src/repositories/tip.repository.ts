import type { Database } from 'better-sqlite3';
import { db } from '../database/sqlite';
import { GameId } from '../config/games';
import { CURATED_TIPS, Tip, validateTip } from '../content/tips';

interface TipState {
  revision: number;
  nextId: number;
  edits: Array<{ id: number; tip: Tip | null }>;
}
export class TipRepository {
  constructor(private readonly database: Database = db) {}
  private key(guildId: string, game: GameId): string {
    if (!/^\d{17,20}$/.test(guildId) || !Object.hasOwn(CURATED_TIPS, game))
      throw new Error('Invalid tip scope.');
    return `tips:${guildId}:${game}`;
  }
  private read(guildId: string, game: GameId): TipState {
    const row = this.database
      .prepare('SELECT value FROM app_settings WHERE key = ?')
      .get(this.key(guildId, game)) as { value: string } | undefined;
    if (!row) return { revision: 0, nextId: 1000, edits: [] };
    if (row.value.length > 1000000) throw new Error('Tip settings exceed the storage limit.');
    const state = JSON.parse(row.value) as TipState;
    if (
      !Number.isSafeInteger(state.revision) ||
      state.revision < 0 ||
      state.revision > 999999999 ||
      !Number.isSafeInteger(state.nextId) ||
      state.nextId < 1000 ||
      state.nextId > 999999999 ||
      !Array.isArray(state.edits) ||
      state.edits.length > 250
    )
      throw new Error('Invalid tip settings.');
    const ids = new Set<number>();
    for (const entry of state.edits) {
      if (
        !Number.isSafeInteger(entry.id) ||
        entry.id < 1 ||
        entry.id >= state.nextId ||
        ids.has(entry.id)
      )
        throw new Error('Invalid tip entry.');
      ids.add(entry.id);
      if (entry.tip !== null && (validateTip(entry.tip).game !== game || entry.tip.id !== entry.id))
        throw new Error('Invalid tip entry scope.');
    }
    return state;
  }
  revision(guildId: string, game: GameId): number {
    return this.read(guildId, game).revision;
  }
  list(guildId: string | null | undefined, game: GameId, includeDisabled = false): Tip[] {
    const edits = guildId ? this.read(guildId, game).edits : [];
    return [
      ...CURATED_TIPS[game].map((tip) => {
        const edit = edits.find((e) => e.id === tip.id);
        return edit ? (edit.tip ?? (includeDisabled ? tip : null)) : tip;
      }),
      ...edits.filter((e) => e.id >= 1000).map((e) => e.tip),
    ]
      .filter((tip): tip is Tip => !!tip)
      .sort((left, right) => left.id - right.id)
      .map((tip) => structuredClone(tip));
  }
  displayNumber(guildId: string | null | undefined, game: GameId, id: number): number {
    return this.list(guildId, game, true).findIndex((tip) => tip.id === id) + 1;
  }
  isDisabled(guildId: string, game: GameId, id: number): boolean {
    return this.read(guildId, game).edits.some((e) => e.id === id && e.tip === null);
  }
  change(
    guildId: string,
    game: GameId,
    expected: number,
    action: 'save' | 'remove' | 'restore',
    id: number,
    tip?: Tip,
  ): number {
    return this.database.transaction(() => {
      const state = this.read(guildId, game);
      if (state.revision !== expected)
        throw new Error('This menu is outdated. Open /bot tips again.');
      if (state.revision >= 999999999) throw new Error('Tip revision limit reached.');
      if (id === 0 && action === 'save') {
        if (state.edits.length >= 250 || state.nextId >= 999999999)
          throw new Error('This server has reached the tip limit.');
        id = state.nextId++;
      } else if (!this.list(guildId, game, true).some((t) => t.id === id))
        throw new Error('Tip not found.');
      state.edits = state.edits.filter((e) => e.id !== id);
      if (action === 'save') {
        if (!tip || tip.game !== game) throw new Error('Invalid tip scope.');
        if (state.edits.length >= 250) throw new Error('This server has reached the tip limit.');
        state.edits.push({ id, tip: validateTip({ ...tip, id, origin: 'server' }) });
      } else if (action === 'remove' && id < 1000) state.edits.push({ id, tip: null });
      else if (action === 'restore' && id >= 1000)
        throw new Error('Only built-in tips have defaults.');
      state.revision++;
      this.database
        .prepare(
          `INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`,
        )
        .run(this.key(guildId, game), JSON.stringify(state));
      return id;
    })();
  }
}
export const tipRepository = new TipRepository();
