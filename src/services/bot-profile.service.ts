import axios from 'axios';
import { Guild, Attachment, GuildMemberEditMeOptions } from 'discord.js';
import { loadImage } from 'canvas';
import { db } from '../database/sqlite';
import { readDiscordFile } from '../utils/discord-file';
import { guildBrandingService } from './guild-branding.service';
import { guildRepository } from '../repositories/guild.repository';

const LIMIT = 2 * 1024 * 1024;
export interface BotProfileSettings {
  nickname?: string;
  description?: string;
  avatar?: boolean;
  banner?: boolean;
}
export function botProfileSettings(guildId: string): BotProfileSettings {
  const row = db
    .prepare('SELECT value FROM app_settings WHERE key=?')
    .get(`manual_guild_profile:${guildId}`) as { value: string } | undefined;
  try {
    return row ? JSON.parse(row.value) : {};
  } catch {
    return {};
  }
}
export async function validateProfileImage(bytes: Buffer): Promise<void> {
  if (bytes.length < 24 || bytes.length > LIMIT)
    throw new Error('Use a PNG or JPEG image smaller than 2 MB.');
  let width = 0,
    height = 0;
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    width = bytes.readUInt32BE(16);
    height = bytes.readUInt32BE(20);
  } else if (bytes[0] === 255 && bytes[1] === 216) {
    for (let i = 2; i + 8 < bytes.length; ) {
      if (bytes[i] !== 255) break;
      const marker = bytes[i + 1];
      i += 2;
      if (marker === 216 || marker === 217 || marker === 0) break;
      const size = bytes.readUInt16BE(i);
      if (size < 2 || i + size > bytes.length) break;
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
        height = bytes.readUInt16BE(i + 3);
        width = bytes.readUInt16BE(i + 5);
        break;
      }
      i += size;
    }
  }
  if (!width || !height || width > 4096 || height > 4096 || width * height > 12000000)
    throw new Error('Use a PNG or JPEG up to 4096 pixels per side and 12 megapixels.');
  const image = await loadImage(bytes);
  if (image.width !== width || image.height !== height)
    throw new Error('The image dimensions could not be verified.');
}
let imageDownloads = 0;
export async function profileImage(file?: Attachment, url?: string): Promise<Buffer> {
  if (imageDownloads >= 2) throw new Error('Image uploads are busy. Try again shortly.');
  imageDownloads++;
  try {
    return await downloadProfileImage(file, url);
  } finally {
    imageDownloads--;
  }
}
async function downloadProfileImage(file?: Attachment, url?: string): Promise<Buffer> {
  if (!!file === !!url?.trim()) throw new Error('Choose either one image upload or one image URL.');
  let bytes: Buffer;
  if (file) bytes = await readDiscordFile(file, LIMIT);
  else {
    const parsed = new URL(url!.trim());
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      (parsed.port && parsed.port !== '443') ||
      ![
        'cdn.discordapp.com',
        'media.discordapp.net',
        'media.moddb.com',
        'www.gamereplays.org',
        'i.imgur.com',
        'raw.githubusercontent.com',
      ].includes(parsed.hostname)
    )
      throw new Error(
        'Use a direct HTTPS image on Discord, ModDB, GameReplays, Imgur or raw GitHub, or upload the image.',
      );
    const response = await axios.get<ArrayBuffer>(parsed.toString(), {
      responseType: 'arraybuffer',
      timeout: 8000,
      maxRedirects: 0,
      maxContentLength: LIMIT,
      maxBodyLength: LIMIT,
    });
    bytes = Buffer.from(response.data);
  }
  await validateProfileImage(bytes);
  return bytes;
}
export class BotProfileService {
  private changing = new Set<string>();
  private lastChanged = new Map<string, number>();
  async update(
    guild: Guild,
    field: 'nickname' | 'description' | 'avatar' | 'banner',
    value: string | Buffer,
  ): Promise<void> {
    if (this.changing.has(guild.id) || Date.now() - (this.lastChanged.get(guild.id) ?? 0) < 15000)
      throw new Error('Wait 15 seconds before changing the bot profile again.');
    if (
      typeof value === 'string' &&
      (value.length > (field === 'nickname' ? 32 : 190) ||
        [...value].some((character) => character.charCodeAt(0) <= 8))
    )
      throw new Error('Check the nickname or description length.');
    this.changing.add(guild.id);
    try {
      await guildBrandingService.exclusive(guild.id, async () => {
        const options: GuildMemberEditMeOptions =
          field === 'nickname'
            ? { nick: String(value) || null }
            : field === 'description'
              ? { bio: String(value) || null }
              : { [field]: value };
        await guild.members.editMe(options);
        const settings = botProfileSettings(guild.id);
        if (field === 'nickname' || field === 'description') settings[field] = String(value);
        else settings[field] = true;
        db.prepare(
          `INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
        ).run(`manual_guild_profile:${guild.id}`, JSON.stringify(settings));
        this.lastChanged.set(guild.id, Date.now());
      });
    } finally {
      this.changing.delete(guild.id);
    }
  }
  async reset(guild: Guild): Promise<void> {
    if (this.changing.has(guild.id) || Date.now() - (this.lastChanged.get(guild.id) ?? 0) < 15000)
      throw new Error('Wait 15 seconds before changing the bot profile again.');
    this.changing.add(guild.id);
    try {
      await guildBrandingService.exclusive(guild.id, async () => {
        await guild.members.editMe({ nick: null, bio: null, avatar: null, banner: null });
        db.prepare('DELETE FROM app_settings WHERE key IN (?,?)').run(
          `manual_guild_profile:${guild.id}`,
          `guild_branding:${guild.id}`,
        );
        this.lastChanged.set(guild.id, Date.now());
      });
      await guildBrandingService.apply(
        guild,
        guildRepository.findByDiscordId(guild.id)?.game ?? 'ra3',
      );
    } finally {
      this.changing.delete(guild.id);
    }
  }
}
export const botProfileService = new BotProfileService();
