import { createHash } from 'node:crypto';
import { db } from '../database/sqlite';
import { GameId } from '../config/games';
import { Master, masterRepository } from './master.repository';

export class MasterValidationError extends Error {}
interface Roster {
  version: number;
  entries: Master[];
}

export function validateMaster(name: string, year: number, patch?: string): Omit<Master, 'id'> {
  const cleanName = name.trim();
  const cleanPatch = patch?.trim() || undefined;
  if (
    !cleanName ||
    cleanName.length > 50 ||
    (cleanPatch?.length ?? 0) > 50 ||
    [...(cleanName + (cleanPatch ?? ''))].some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 || char === '\u2014',
    )
  )
    throw new MasterValidationError(
      'Use a name and optional patch of up to 50 characters, without line breaks or long dashes.',
    );
  const currentYear = new Date().getUTCFullYear();
  if (!Number.isInteger(year) || year < 2008 || year > currentYear)
    throw new MasterValidationError(`Year must be between 2008 and ${currentYear}.`);
  return { name: cleanName, year, patch: cleanPatch };
}

export class MasterRosterRepository {
  private key(guild: string, game: GameId) {
    if (!/^\d{17,20}$/.test(guild) || !['ra3', 'genevo'].includes(game))
      throw new Error('Invalid masters scope.');
    return `masters-roster:${guild}:${game}`;
  }
  private read(guild: string | null, game: GameId): Roster {
    const row = guild
      ? (db.prepare('SELECT value FROM app_settings WHERE key = ?').get(this.key(guild, game)) as
          | { value: string }
          | undefined)
      : undefined;
    if (!row) return { version: 0, entries: masterRepository.getAll(game) };
    if (row.value.length > 100000) throw new Error('Invalid masters roster.');
    const state = JSON.parse(row.value) as Roster;
    if (
      !Number.isSafeInteger(state.version) ||
      state.version < 1 ||
      !Array.isArray(state.entries) ||
      state.entries.length > 250
    )
      throw new Error('Invalid masters roster.');
    const ids = new Set<number>();
    for (const entry of state.entries) {
      if (
        !Number.isSafeInteger(entry.id) ||
        entry.id < 1 ||
        entry.id > 999999999 ||
        ids.has(entry.id)
      )
        throw new Error('Invalid master ID.');
      ids.add(entry.id);
      validateMaster(entry.name, entry.year, entry.patch);
    }
    return state;
  }
  snapshot(guild: string | null, game: GameId) {
    const state = this.read(guild, game);
    return {
      entries: [...state.entries].sort((a, b) => b.year - a.year || a.name.localeCompare(b.name)),
      revision: createHash('sha256').update(JSON.stringify(state)).digest('hex').slice(0, 12),
    };
  }
  change(
    guild: string,
    game: GameId,
    revision: string,
    id: number,
    value?: Omit<Master, 'id'>,
  ): number {
    return db.transaction(() => {
      if (revision !== this.snapshot(guild, game).revision)
        throw new MasterValidationError('This menu is outdated. Reopen /masters.');
      const state = this.read(guild, game);
      if (id && !state.entries.some((entry) => entry.id === id))
        throw new MasterValidationError('Master not found. Reopen /masters.');
      if (value) {
        const entry = validateMaster(value.name, value.year, value.patch);
        if (
          state.entries.some(
            (item) =>
              item.id !== id &&
              item.name.toLowerCase() === entry.name.toLowerCase() &&
              item.year === entry.year &&
              (item.patch ?? '').toLowerCase() === (entry.patch ?? '').toLowerCase(),
          )
        )
          throw new MasterValidationError('That name, year and patch already exist.');
        if (!id && state.entries.length >= 250)
          throw new MasterValidationError('This server has reached the 250-master limit.');
        if (!id) id = Math.max(0, ...state.entries.map((item) => item.id)) + 1;
        if (id > 999999999) throw new MasterValidationError('Master ID limit reached.');
        state.entries = state.entries.filter((item) => item.id !== id);
        state.entries.push({ id, ...entry });
      } else {
        if (!id) throw new MasterValidationError('Select a master to remove.');
        state.entries = state.entries.filter((item) => item.id !== id);
      }
      state.version++;
      db.prepare(
        `INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`,
      ).run(this.key(guild, game), JSON.stringify(state));
      return id;
    })();
  }
}
export const masterRosterRepository = new MasterRosterRepository();
