import { BaseRepository } from './base.repository';

export class AppSettingsRepository extends BaseRepository {
  getReplayMedals(guildId: string): {
    bronze: number;
    silver: number;
    gold: number;
    diamond: number;
  } {
    const row = this.query<{ value: string }>('SELECT value FROM app_settings WHERE key=?', [
      `replay_medals:${guildId}`,
    ]);
    try {
      const parsed = JSON.parse(row?.value ?? 'null');
      if (parsed && this.validMedals(parsed)) return parsed;
    } catch {
      /* Use defaults for missing or invalid optional settings. */
    }
    return { bronze: 5, silver: 15, gold: 30, diamond: 50 };
  }

  private validMedals(value: {
    bronze: number;
    silver: number;
    gold: number;
    diamond: number;
  }): boolean {
    const values = [value.bronze, value.silver, value.gold, value.diamond];
    return values.every(
      (n, i) => Number.isSafeInteger(n) && n >= 1 && n <= 10000 && (!i || n > values[i - 1]),
    );
  }

  setReplayMedals(
    guildId: string,
    value: { bronze: number; silver: number; gold: number; diamond: number },
  ): void {
    if (!this.validMedals(value))
      throw new Error(
        'Use increasing whole numbers from 1 to 10000: Bronze < Silver < Gold < Diamond.',
      );
    this.run(
      `INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`,
      [`replay_medals:${guildId}`, JSON.stringify(value)],
    );
  }

  hasSeparateFactionCharts(guildId?: string | null): boolean {
    if (!guildId) return false;
    return (
      this.query<{ value: string }>('SELECT value FROM app_settings WHERE key=?', [
        `separate_faction_charts:${guildId}`,
      ])?.value === '1'
    );
  }

  setSeparateFactionCharts(guildId: string, enabled: boolean): void {
    this.run(
      `INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`,
      [`separate_faction_charts:${guildId}`, enabled ? '1' : '0'],
    );
  }

  isDmPublicCommandsEnabled(): boolean {
    const row = this.query<{ value: string }>(
      "SELECT value FROM app_settings WHERE key = 'dm_public_commands_enabled'",
    );
    return row?.value !== '0';
  }

  setDmPublicCommandsEnabled(enabled: boolean): void {
    this.run(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ('dm_public_commands_enabled', ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      [enabled ? '1' : '0'],
    );
  }
}

export const appSettingsRepository = new AppSettingsRepository();
