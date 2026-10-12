import { RefreshTask, refreshSettings } from '../repositories/refresh-settings.repository';
import { logger } from './logger';

export const REFRESH_CHECK_MS = 30_000;
export class RefreshSchedule {
  private lastRun = new Map<string, number>();
  private running = new Set<string>();
  async run(guild: string, task: RefreshTask, work: () => Promise<unknown>): Promise<boolean> {
    const key = `${guild}:${task}`;
    const now = Date.now();
    if (
      this.running.has(key) ||
      now - (this.lastRun.get(key) ?? -Infinity) < refreshSettings.minutes(guild, task) * 60_000
    )
      return false;
    this.lastRun.set(key, now);
    this.running.add(key);
    // Remove inactive server/task entries after the maximum configurable interval.
    for (const [oldKey, timestamp] of this.lastRun)
      if (now - timestamp > 2 * 86400000 && !this.running.has(oldKey)) this.lastRun.delete(oldKey);
    try {
      await work();
      return true;
    } finally {
      this.running.delete(key);
    }
  }
}
export const panelRefreshSchedule = new RefreshSchedule();

/** Dynamic shared interval; changes apply without restarting the scanner. */
export function startScannerTimer(task: RefreshTask, work: () => Promise<unknown>): NodeJS.Timeout {
  let lastRun = Date.now(),
    running = false;
  const timer = setInterval(() => {
    if (running) return;
    try {
      if (Date.now() - lastRun < refreshSettings.minutes(null, task) * 60_000) return;
    } catch (error) {
      logger.error('Unable to read scanner interval', { task, error });
      return;
    }
    lastRun = Date.now();
    running = true;
    Promise.resolve()
      .then(work)
      .catch((error) => logger.error('Scheduled refresh failed', { task, error }))
      .finally(() => {
        running = false;
      });
  }, REFRESH_CHECK_MS);
  timer.unref();
  return timer;
}
