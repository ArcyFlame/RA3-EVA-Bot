import { OwnedSessions } from '../../utils/owned-sessions';
import { GameId } from '../../config/games';
import { Language } from '../../repositories/user.repository';

export type LinkPlatform = 'shatabrick' | 'ra3b';
export interface PendingLink {
  ownerId: string;
  guildId?: string | null;
  game: GameId;
  lang: Language;
  platform: LinkPlatform;
  nickname: string;
  profileId?: number;
}
export const pendingLinks = new OwnedSessions<PendingLink>();

export function parseLinkIdentifier(raw: string, platform: LinkPlatform): string | undefined {
  const value = raw.trim();
  if (value.length > 256) return;
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        (url.port && url.port !== '443')
      )
        return;
      if (platform === 'ra3b' && ['ra3battle.net', 'www.ra3battle.net'].includes(url.hostname)) {
        return url.pathname.match(/^\/persona\/(\d{1,10})\/?$/)?.[1];
      }
      if (
        platform === 'shatabrick' &&
        ['www.shatabrick.com', 'shatabrick.com'].includes(url.hostname) &&
        url.pathname === '/cco/ra3/index.php' &&
        url.searchParams.get('a') === 'pp'
      ) {
        const id = url.searchParams.get('id');
        return id && /^\d{1,10}$/.test(id) ? id : undefined;
      }
    } catch {
      return;
    }
    return;
  }
  return value.length <= 64 && /^[\p{L}\p{N}_.\- ]+$/u.test(value) ? value : undefined;
}
