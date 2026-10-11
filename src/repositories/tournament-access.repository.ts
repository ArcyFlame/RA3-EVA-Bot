import { BaseRepository } from './base.repository';

export class TournamentAccessRepository extends BaseRepository {
  organizer(eventId: number): string | undefined {
    return this.query<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [
      `tournament-organizer:${eventId}`,
    ])?.value;
  }
  setOrganizer(eventId: number, guildId: string | null): void {
    if (!Number.isSafeInteger(eventId) || eventId < 1 || (guildId && !/^\d{17,20}$/.test(guildId)))
      throw new Error('Invalid tournament organizer.');
    const key = `tournament-organizer:${eventId}`;
    if (this.organizer(eventId) !== guildId)
      this.run('DELETE FROM tournament_write_brackets WHERE event_id = ?', [eventId]);
    if (!guildId) {
      this.run('DELETE FROM app_settings WHERE key = ?', [key]);
      return;
    }
    this.run(
      `INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`,
      [key, guildId],
    );
  }

  /** Only the bot-owner link workflow may grant shared API write authority. */
  authorizeBracket(eventId: number, tournamentId: string, guildId: string, ref: string): boolean {
    if (
      !/^[1-9]\d{0,15}$/.test(tournamentId) ||
      !Number.isSafeInteger(Number(tournamentId)) ||
      this.organizer(eventId) !== guildId
    )
      return false;
    const existing = this.query<{ event_id: number; guild_id: string }>(
      'SELECT event_id, guild_id FROM tournament_write_brackets WHERE tournament_id = ?',
      [tournamentId],
    );
    if (existing && (existing.event_id !== eventId || existing.guild_id !== guildId)) return false;
    this.run(
      `INSERT INTO tournament_write_brackets(tournament_id,event_id,guild_id,ref) VALUES(?,?,?,?)
      ON CONFLICT(tournament_id) DO UPDATE SET ref=excluded.ref`,
      [tournamentId, eventId, guildId, ref],
    );
    return true;
  }

  bracketOwner(tournamentId: string): number | undefined {
    return this.query<{ event_id: number }>(
      'SELECT event_id FROM tournament_write_brackets WHERE tournament_id = ?',
      [tournamentId],
    )?.event_id;
  }

  bracketIdentity(ref: string): string | undefined {
    return this.query<{ value: string }>('SELECT value FROM app_settings WHERE key=?', [
      `challonge-identity:${ref}`,
    ])?.value;
  }

  rememberBracketIdentity(ref: string, id: unknown): string | undefined {
    const value = String(id);
    if (!/^[1-9]\d{0,15}$/.test(value) || !Number.isSafeInteger(Number(value))) return undefined;
    this.run(
      `INSERT INTO app_settings(key,value) VALUES(?,?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`,
      [`challonge-identity:${ref}`, value],
    );
    return value;
  }

  writableBracket(eventId: number, ref: string): string | undefined {
    return this.query<{ tournament_id: string }>(
      `SELECT tournament_id FROM tournament_write_brackets
       WHERE event_id=? AND guild_id=? AND (ref=? OR tournament_id=?)`,
      [eventId, this.organizer(eventId) ?? '', ref, ref],
    )?.tournament_id;
  }

  claimCheckinAlerts(eventId: number, names: string[], now = Date.now()): string[] {
    return this.db.transaction(() => {
      this.run('DELETE FROM checkin_alert_budget WHERE notified_at < ?', [now - 86400000]);
      const recent =
        this.query<{ n: number }>(
          'SELECT COUNT(*) AS n FROM checkin_alert_budget WHERE event_id=? AND notified_at>?',
          [eventId, now - 60000],
        )?.n ?? 0;
      if (recent >= 20) return [];
      const accepted: string[] = [];
      for (const name of names.slice(0, 20 - recent)) {
        const key = name.normalize('NFKC').trim().toLowerCase();
        if (!key || key.length > 200) continue;
        const changed = this.run(
          `INSERT INTO checkin_alert_budget(event_id,player_key,notified_at) VALUES(?,?,?)
          ON CONFLICT(event_id,player_key) DO UPDATE SET notified_at=excluded.notified_at
          WHERE checkin_alert_budget.notified_at <= ?`,
          [eventId, key, now, now - 600000],
        );
        if (changed.changes) accepted.push(name);
      }
      return accepted;
    })();
  }
}
export const tournamentAccessRepository = new TournamentAccessRepository();
