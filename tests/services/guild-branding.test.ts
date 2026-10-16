import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Guild } from 'discord.js';
import { connectDatabase } from '../../src/database/connection';
import { db } from '../../src/database/sqlite';
import { guildRepository } from '../../src/repositories/guild.repository';
import { GuildBrandingService } from '../../src/services/guild-branding.service';
import { readFile } from 'node:fs/promises';

vi.mock('node:fs/promises', () => ({ readFile: vi.fn() }));
beforeAll(connectDatabase);
beforeEach(() => vi.clearAllMocks());
let sequence = 0;
function fixture(game: 'ra3' | 'genevo') {
  const id = `branding-${++sequence}`;
  guildRepository.upsert(id, { game });
  const editMe = vi.fn().mockResolvedValue({ avatar: 'server-avatar', banner: 'server-banner' });
  const guild = { id, members: { editMe } } as unknown as Guild;
  return { guild, editMe };
}
function png() {
  const bytes = Buffer.alloc(32);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  bytes.writeUInt32BE(620, 16);
  bytes.writeUInt32BE(350, 20);
  return bytes;
}
function stored(id: string) {
  return db.prepare('SELECT value FROM app_settings WHERE key=?').get(`guild_branding:${id}`);
}
describe('server-specific bot profiles', () => {
  it('preserves a manually configured avatar while applying the default banner', async () => {
    const { guild, editMe } = fixture('genevo');
    db.prepare('INSERT INTO app_settings(key,value) VALUES(?,?)').run(
      `manual_guild_profile:${guild.id}`,
      JSON.stringify({ avatar: true }),
    );
    vi.mocked(readFile).mockResolvedValue(png());
    expect(await new GuildBrandingService().apply(guild, 'genevo')).toBe(true);
    expect(editMe).toHaveBeenCalledWith({ banner: png() });
  });
  it('leaves RA3 default avatars and banners untouched', async () => {
    const { guild, editMe } = fixture('ra3');
    expect(await new GuildBrandingService().apply(guild, 'ra3')).toBe(true);
    expect(editMe).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
  });
  it('applies GenEvo artwork only to the current bot member, not the global user or guild', async () => {
    const { guild, editMe } = fixture('genevo');
    const banner = png();
    banner.writeUInt32BE(1920, 16);
    vi.mocked(readFile).mockImplementation(async (file) =>
      String(file).includes('banner') ? banner : png(),
    );
    expect(await new GuildBrandingService().apply(guild, 'genevo')).toBe(true);
    expect(editMe).toHaveBeenCalledWith({ avatar: png(), banner });
    expect(stored(guild.id)).toBeDefined();
    expect(await new GuildBrandingService().apply(guild, 'genevo')).toBe(true);
    expect(editMe).toHaveBeenCalledTimes(1);
    expect(readFile).toHaveBeenCalledTimes(4);
  });
  it('restores global defaults only when switching away from a managed GenEvo profile', async () => {
    const { guild, editMe } = fixture('genevo');
    vi.mocked(readFile).mockResolvedValue(png());
    const service = new GuildBrandingService();
    await service.apply(guild, 'genevo');
    guildRepository.setGame(guild.id, 'ra3');
    await service.apply(guild, 'ra3');
    expect(editMe).toHaveBeenLastCalledWith({ avatar: null, banner: null });
    expect(stored(guild.id)).toBeUndefined();
  });
  it('does not record a failed Discord upload, and retries on next startup', async () => {
    const { guild, editMe } = fixture('genevo');
    vi.mocked(readFile).mockResolvedValue(png());
    editMe.mockRejectedValueOnce(new Error('Discord unavailable'));
    const service = new GuildBrandingService();
    expect(await service.apply(guild, 'genevo')).toBe(false);
    expect(stored(guild.id)).toBeUndefined();
    expect(await service.apply(guild, 'genevo')).toBe(true);
  });
  it.each(['html', 'large', 'dimensions'])(
    'refuses invalid %s artwork before upload',
    async (kind) => {
      const { guild, editMe } = fixture('genevo');
      const image =
        kind === 'html'
          ? Buffer.from('<html>bad response</html>')
          : kind === 'large'
            ? Buffer.alloc(3 * 1024 * 1024)
            : png();
      if (kind === 'dimensions') image.writeUInt32BE(9000, 16);
      vi.mocked(readFile).mockResolvedValue(image);
      expect(await new GuildBrandingService().apply(guild, 'genevo')).toBe(false);
      expect(editMe).not.toHaveBeenCalled();
    },
  );
  it('does not apply stale GenEvo artwork if setup changes while a download is in flight', async () => {
    const { guild, editMe } = fixture('genevo');
    let finish!: (value: Buffer) => void;
    const pending = new Promise<Buffer>((resolve) => {
      finish = resolve;
    });
    vi.mocked(readFile).mockReturnValue(pending);
    const service = new GuildBrandingService();
    const first = service.apply(guild, 'genevo');
    await vi.waitFor(() => expect(readFile).toHaveBeenCalledTimes(2));
    guildRepository.setGame(guild.id, 'ra3');
    const second = service.apply(guild, 'ra3');
    finish(png());
    expect(await first).toBe(false);
    expect(await second).toBe(true);
    expect(editMe).not.toHaveBeenCalled();
  });
});
