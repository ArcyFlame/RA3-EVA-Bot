import { BaseRepository } from './base.repository';

export class AppSettingsRepository extends BaseRepository {
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
