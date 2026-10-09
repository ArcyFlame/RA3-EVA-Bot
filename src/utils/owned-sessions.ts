import { randomBytes } from 'crypto';

export class OwnedSessions<T extends { ownerId: string; guildId?: string | null }> {
  private sessions = new Map<string, { value: T; expires: number }>();

  create(value: T): string {
    for (const [key, session] of this.sessions)
      if (session.expires <= Date.now()) this.sessions.delete(key);
    if (this.sessions.size >= 1000) this.sessions.delete(this.sessions.keys().next().value!);
    const key = randomBytes(12).toString('hex');
    this.sessions.set(key, { value, expires: Date.now() + 10 * 60_000 });
    return key;
  }

  get(key: string, ownerId: string, guildId?: string | null): T | undefined {
    const session = this.sessions.get(key);
    if (!session || session.expires <= Date.now()) {
      this.sessions.delete(key);
      return;
    }
    if (session.value.ownerId !== ownerId || (session.value.guildId ?? null) !== (guildId ?? null))
      return;
    return session.value;
  }

  delete(key: string): void {
    this.sessions.delete(key);
  }
}
