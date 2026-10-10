import axios from 'axios';
import { Attachment } from 'discord.js';

export async function readDiscordFile(
  attachment: Pick<Attachment, 'url' | 'size'>,
  limit: number,
): Promise<Buffer> {
  const url = new URL(attachment.url);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    !['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname) ||
    !/^\/(?:ephemeral-)?attachments\/\d+\/\d+\//.test(url.pathname) ||
    attachment.size < 1 ||
    attachment.size > limit
  )
    throw new Error('Choose a valid Discord attachment within the file size limit.');
  const response = await axios.get<ArrayBuffer>(url.toString(), {
    responseType: 'arraybuffer',
    timeout: 8000,
    maxRedirects: 0,
    maxContentLength: limit,
    maxBodyLength: limit,
  });
  const bytes = Buffer.from(response.data);
  if (bytes.length !== attachment.size || bytes.length > limit)
    throw new Error('The attachment size could not be verified.');
  return bytes;
}
