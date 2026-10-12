import { db } from '../database/sqlite';

export const REFRESH_TASKS = {
  lobby: { label: 'Lobby panel', minutes: 3, min: 1, global: false },
  stats: { label: 'Stats panel', minutes: 10, min: 5, global: false },
  matches: { label: 'Match panel', minutes: 2, min: 2, global: false },
  news: { label: 'News scanner', minutes: 60, min: 15, global: true },
  tournaments: { label: 'Tournament scanner', minutes: 360, min: 60, global: true },
  forum: { label: 'Tournament forum scanner', minutes: 180, min: 30, global: true },
  twitch: { label: 'Twitch scanner', minutes: 5, min: 5, global: true },
  youtube: { label: 'YouTube polling', minutes: 15, min: 15, global: true },
  moddb: { label: 'ModDB scanner', minutes: 15, min: 15, global: true },
} as const;
export type RefreshTask = keyof typeof REFRESH_TASKS;
export class RefreshValidationError extends Error {}
type State = { revision: number; values: Partial<Record<RefreshTask, number>> };
export class RefreshSettingsRepository {
  private key(guild: string | null, task: RefreshTask) {
    if (!Object.hasOwn(REFRESH_TASKS, task))
      throw new RefreshValidationError('Unknown refresh task.');
    if (REFRESH_TASKS[task].global) return 'refresh:global';
    if (!guild || !/^\d{17,20}$/.test(guild)) throw new RefreshValidationError('Server only.');
    return `refresh:${guild}`;
  }
  read(guild: string | null, task: RefreshTask): State {
    const row = db
      .prepare('SELECT value FROM app_settings WHERE key=?')
      .get(this.key(guild, task)) as { value: string } | undefined;
    if (!row) return { revision: 0, values: {} };
    const state = JSON.parse(row.value) as State;
    if (
      !Number.isSafeInteger(state.revision) ||
      state.revision < 0 ||
      !state.values ||
      typeof state.values !== 'object'
    )
      throw new Error('Invalid refresh settings.');
    for (const [key, value] of Object.entries(state.values)) {
      if (
        !Object.hasOwn(REFRESH_TASKS, key) ||
        !Number.isInteger(value) ||
        value! < REFRESH_TASKS[key as RefreshTask].min ||
        value! > 1440
      )
        throw new Error('Invalid refresh interval.');
    }
    return state;
  }
  minutes(guild: string | null, task: RefreshTask): number {
    return this.read(guild, task).values[task] ?? REFRESH_TASKS[task].minutes;
  }
  set(guild: string, task: RefreshTask, revision: number, minutes: number | null): void {
    db.transaction(() => {
      const state = this.read(guild, task);
      if (state.revision !== revision)
        throw new RefreshValidationError('This menu is outdated. Reopen /bot refresh.');
      if (
        minutes !== null &&
        (!Number.isInteger(minutes) || minutes < REFRESH_TASKS[task].min || minutes > 1440)
      )
        throw new RefreshValidationError(
          `Enter a whole number from ${REFRESH_TASKS[task].min} to 1440 minutes.`,
        );
      if (minutes === null) delete state.values[task];
      else state.values[task] = minutes;
      state.revision++;
      db.prepare(
        `INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`,
      ).run(this.key(guild, task), JSON.stringify(state));
    })();
  }
}
export const refreshSettings = new RefreshSettingsRepository();
