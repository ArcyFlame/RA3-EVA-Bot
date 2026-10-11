import { BaseRepository } from './base.repository';

export type TipSetting = 'enabled' | 'private' | 'public';
export interface TipSettings {
  enabled: boolean;
  private: boolean;
  public: boolean;
}
const defaults: TipSettings = { enabled: true, private: true, public: true };

export class TipSettingsRepository extends BaseRepository {
  get(guildId: string | null | undefined): TipSettings {
    if (!guildId) return { ...defaults };
    const row = this.query<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [
      `tip-settings:${guildId}`,
    ]);
    if (!row) return { ...defaults };
    try {
      const value = JSON.parse(row.value) as TipSettings;
      if (
        ['enabled', 'private', 'public'].every(
          (key) => typeof value?.[key as TipSetting] === 'boolean',
        )
      )
        return { enabled: value.enabled, private: value.private, public: value.public };
    } catch {
      /* Invalid settings fail closed. */
    }
    return { enabled: false, private: false, public: false };
  }

  set(guildId: string, setting: TipSetting, enabled: boolean): void {
    if (!guildId || !['enabled', 'private', 'public'].includes(setting))
      throw new Error('Invalid tip setting.');
    const settings = this.get(guildId);
    settings[setting] = enabled;
    this.run(
      `INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`,
      [`tip-settings:${guildId}`, JSON.stringify(settings)],
    );
  }
}
export const tipSettingsRepository = new TipSettingsRepository();
