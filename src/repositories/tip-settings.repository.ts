import { BaseRepository } from './base.repository';

export type TipVisibility = 'private' | 'public';
export interface TipSettings {
  enabled: boolean;
  visibility: TipVisibility;
}
const defaults: TipSettings = { enabled: true, visibility: 'public' };

export class TipSettingsRepository extends BaseRepository {
  get(guildId: string | null | undefined): TipSettings {
    if (!guildId) return { ...defaults };
    const row = this.query<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [
      `tip-settings:${guildId}`,
    ]);
    if (!row) return { ...defaults };
    try {
      const value = JSON.parse(row.value);
      if (
        typeof value?.enabled === 'boolean' &&
        (value.visibility === 'public' || value.visibility === 'private')
      )
        return { enabled: value.enabled, visibility: value.visibility };
      // Preserve an explicit private-only choice from the previous settings format.
      if (
        typeof value?.enabled === 'boolean' &&
        typeof value.private === 'boolean' &&
        typeof value.public === 'boolean'
      )
        return {
          enabled: value.enabled && (value.private || value.public),
          visibility: value.public ? 'public' : 'private',
        };
    } catch {
      /* Invalid settings fail closed. */
    }
    return { enabled: false, visibility: 'private' };
  }

  setEnabled(guildId: string, enabled: boolean): void {
    if (typeof enabled !== 'boolean') throw new Error('Invalid tip setting.');
    this.save(guildId, { ...this.get(guildId), enabled });
  }

  setVisibility(guildId: string, visibility: TipVisibility): void {
    if (visibility !== 'public' && visibility !== 'private')
      throw new Error('Invalid tip visibility.');
    this.save(guildId, { ...this.get(guildId), visibility });
  }

  private save(guildId: string, settings: TipSettings): void {
    if (!guildId) throw new Error('Invalid tip setting.');
    this.run(
      `INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`,
      [`tip-settings:${guildId}`, JSON.stringify(settings)],
    );
  }
}
export const tipSettingsRepository = new TipSettingsRepository();
