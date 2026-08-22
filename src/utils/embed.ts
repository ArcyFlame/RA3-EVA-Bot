import { EmbedBuilder, ColorResolvable } from 'discord.js';

export function createEmbed(
  title: string,
  description?: string,
  color: ColorResolvable = 0x5865f2,
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description || '')
    .setColor(color)
    .setTimestamp();
}

export function successEmbed(message: string): EmbedBuilder {
  return createEmbed('✅ Success', message, 0x57f287);
}

export function errorEmbed(message: string): EmbedBuilder {
  return createEmbed('❌ Error', message, 0xed4245);
}

export function infoEmbed(title: string, description: string): EmbedBuilder {
  return createEmbed(title, description, 0x5865f2);
}
