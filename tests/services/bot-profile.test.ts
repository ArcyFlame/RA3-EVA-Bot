import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCanvas } from 'canvas';
import axios from 'axios';
import { connectDatabase } from '../../src/database/connection';
import { guildRepository } from '../../src/repositories/guild.repository';
import {
  botProfileSettings,
  BotProfileService,
  profileImage,
  validateProfileImage,
} from '../../src/services/bot-profile.service';
import { guildBrandingService } from '../../src/services/guild-branding.service';
import { sourceGet } from '../../src/utils/safe-fetch';
vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('../../src/utils/safe-fetch', () => ({ sourceGet: vi.fn() }));
let sequence = 0;
beforeAll(connectDatabase);
beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
});
function fixture() {
  const id = `bot-profile-${++sequence}`;
  guildRepository.upsert(id, { game: 'ra3' });
  const guild: any = { id, members: { editMe: vi.fn().mockResolvedValue({}) } };
  return { guild, service: new BotProfileService() };
}
const png = () => createCanvas(2, 2).toBuffer('image/png');
describe('custom server bot profiles', () => {
  it('changes only the current server nickname/bio and persists custom settings', async () => {
    const f = fixture(),
      other = fixture();
    await f.service.update(f.guild, 'nickname', 'GenEvo EVA');
    expect(f.guild.members.editMe).toHaveBeenCalledWith({ nick: 'GenEvo EVA' });
    expect(botProfileSettings(f.guild.id).nickname).toBe('GenEvo EVA');
    expect(botProfileSettings(other.guild.id)).toEqual({});
    expect(other.guild.members.editMe).not.toHaveBeenCalled();
    await expect(f.service.update(f.guild, 'description', 'New bio')).rejects.toThrow('15 seconds');
    await expect(f.service.reset(f.guild)).rejects.toThrow('15 seconds');
    await new BotProfileService().update(f.guild, 'description', 'New bio');
    expect(f.guild.members.editMe).toHaveBeenLastCalledWith({ bio: 'New bio' });
  });
  it('does not persist an unsuccessful Discord profile update', async () => {
    const f = fixture();
    f.guild.members.editMe.mockRejectedValueOnce(new Error('Discord denied'));
    await expect(f.service.update(f.guild, 'avatar', png())).rejects.toThrow('denied');
    expect(botProfileSettings(f.guild.id)).toEqual({});
  });
  it('protects custom artwork from game branding updates and restores defaults explicitly', async () => {
    const f = fixture();
    await f.service.update(f.guild, 'avatar', png());
    await new BotProfileService().update(f.guild, 'banner', png());
    guildRepository.setGame(f.guild.id, 'genevo');
    expect(await guildBrandingService.apply(f.guild, 'genevo')).toBe(true);
    expect(sourceGet).not.toHaveBeenCalled();
    expect(f.guild.members.editMe).toHaveBeenCalledTimes(2);
    guildRepository.setGame(f.guild.id, 'ra3');
    await new BotProfileService().reset(f.guild);
    expect(f.guild.members.editMe).toHaveBeenLastCalledWith({
      nick: null,
      bio: null,
      avatar: null,
      banner: null,
    });
    expect(botProfileSettings(f.guild.id)).toEqual({});
  });
  it('serializes default artwork and custom edits so a delayed default download cannot overwrite an admin', async () => {
    const f = fixture();
    guildRepository.setGame(f.guild.id, 'genevo');
    let finish!: (value: any) => void;
    vi.mocked(sourceGet).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const defaults = guildBrandingService.apply(f.guild, 'genevo');
    await vi.waitFor(() => expect(finish).toBeDefined());
    const custom = f.service.update(f.guild, 'avatar', png());
    finish({ data: png() });
    await Promise.all([defaults, custom]);
    expect(f.guild.members.editMe.mock.calls.map(([p]: any[]) => Object.keys(p))).toEqual([
      ['avatar', 'banner'],
      ['avatar'],
    ]);
    expect(botProfileSettings(f.guild.id).avatar).toBe(true);
  });
  it('accepts bounded PNG bytes from an uploaded Discord file or an allowed direct HTTPS URL', async () => {
    const bytes = png();
    vi.mocked(axios.get).mockResolvedValue({ data: bytes });
    expect(
      await profileImage({
        size: bytes.length,
        url: 'https://cdn.discordapp.com/ephemeral-attachments/123/456/avatar.png',
      } as any),
    ).toEqual(bytes);
    expect(await profileImage(undefined, 'https://i.imgur.com/avatar.png')).toEqual(bytes);
    expect(axios.get).toHaveBeenLastCalledWith(
      'https://i.imgur.com/avatar.png',
      expect.objectContaining({ maxRedirects: 0, timeout: 8000, maxContentLength: 2097152 }),
    );
  });
  it.each([
    'http://i.imgur.com/a.png',
    'https://127.0.0.1/a.png',
    'https://i.imgur.com.evil.test/a.png',
    'https://user:pass@i.imgur.com/a.png',
    'https://i.imgur.com:8080/a.png',
  ])('refuses unsafe image URL %s before fetching', async (url) => {
    await expect(profileImage(undefined, url)).rejects.toThrow();
    expect(axios.get).not.toHaveBeenCalled();
  });
  it('refuses invalid images, oversized dimensions, mismatched attachment sizes, and ambiguous inputs', async () => {
    await expect(validateProfileImage(Buffer.from('<svg>unsafe</svg>'))).rejects.toThrow();
    const bytes = png();
    bytes.writeUInt32BE(99999, 16);
    await expect(validateProfileImage(bytes)).rejects.toThrow('pixels');
    vi.mocked(axios.get).mockResolvedValue({ data: png() });
    await expect(
      profileImage({
        size: 999,
        url: 'https://cdn.discordapp.com/attachments/123/456/a.png',
      } as any),
    ).rejects.toThrow();
    await expect(profileImage({ size: 99 } as any, 'https://i.imgur.com/a.png')).rejects.toThrow(
      'either',
    );
  });
});
