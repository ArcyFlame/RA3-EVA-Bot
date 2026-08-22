/**
 * Rate limiting for commands and components to prevent spam and abuse.
 *
 * Entries self-heal: a periodic sweep drops expired rows so the maps stay
 * bounded on long-running processes. The sweep timer is unref'd so it never
 * keeps the event loop (or a shutdown) alive.
 */
export class CooldownManager {
  private cooldowns = new Map<string, Map<string, number>>();
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(private readonly sweepIntervalMs = 60_000) {}

  setCooldown(userId: string, commandName: string, seconds: number): void {
    if (!this.cooldowns.has(commandName)) {
      this.cooldowns.set(commandName, new Map());
    }
    this.cooldowns.get(commandName)!.set(userId, Date.now() + seconds * 1000);
    this.ensureSweep();
  }

  isOnCooldown(
    userId: string,
    commandName: string,
  ): { onCooldown: boolean; remainingSeconds: number } {
    const cmdMap = this.cooldowns.get(commandName);
    if (!cmdMap) return { onCooldown: false, remainingSeconds: 0 };
    const expiry = cmdMap.get(userId);
    if (!expiry) return { onCooldown: false, remainingSeconds: 0 };
    const now = Date.now();
    if (now >= expiry) {
      cmdMap.delete(userId);
      return { onCooldown: false, remainingSeconds: 0 };
    }
    return { onCooldown: true, remainingSeconds: Math.ceil((expiry - now) / 1000) };
  }

  clearCooldown(userId: string, commandName: string): void {
    this.cooldowns.get(commandName)?.delete(userId);
  }

  /** Current number of tracked entries (diagnostics/tests). */
  get size(): number {
    let total = 0;
    for (const map of this.cooldowns.values()) total += map.size;
    return total;
  }

  private ensureSweep(): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => this.sweep(), this.sweepIntervalMs);
    this.sweepTimer.unref();
  }

  private sweep(): void {
    const now = Date.now();
    for (const [commandName, map] of this.cooldowns) {
      for (const [userId, expiry] of map) {
        if (now >= expiry) map.delete(userId);
      }
      if (map.size === 0) this.cooldowns.delete(commandName);
    }
  }
}

export const cooldownManager = new CooldownManager();
