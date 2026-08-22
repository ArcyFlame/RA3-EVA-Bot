import axios from 'axios';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export interface TwitchUser {
  id: string;
  login: string;
  displayName: string;
  profileImageUrl: string;
}

export interface TwitchStream {
  id: string;
  userId: string;
  userName: string;
  title: string;
  gameName: string;
  viewerCount: number;
  startedAt: string;
  thumbnailUrl: string;
}

export class TwitchService {
  private appAccessToken: { token: string; expiresAt: number } | null = null;
  private userAccessToken: { token: string; expiresAt: number } | null = null;

  private async getAppAccessToken(): Promise<string> {
    if (this.appAccessToken && Date.now() < this.appAccessToken.expiresAt) {
      return this.appAccessToken.token;
    }

    try {
      const res = await axios.post('https://id.twitch.tv/oauth2/token', null, {
        params: {
          client_id: env.TWITCH_CLIENT_ID,
          client_secret: env.TWITCH_CLIENT_SECRET,
          grant_type: 'client_credentials',
        },
      });

      const token = res.data.access_token;
      const expiresAt = Date.now() + res.data.expires_in * 1000 - 60000;
      this.appAccessToken = { token, expiresAt };
      logger.debug('Twitch App Access Token obtained');
      return token;
    } catch (error) {
      logger.error('Failed to get Twitch App Access Token:', error);
      throw error;
    }
  }

  private async getUserAccessToken(): Promise<string | null> {
    if (!env.TWITCH_REFRESH_TOKEN) return null;
    if (this.userAccessToken && Date.now() < this.userAccessToken.expiresAt) {
      return this.userAccessToken.token;
    }

    try {
      const res = await axios.post('https://id.twitch.tv/oauth2/token', null, {
        params: {
          client_id: env.TWITCH_CLIENT_ID,
          client_secret: env.TWITCH_CLIENT_SECRET,
          grant_type: 'refresh_token',
          refresh_token: env.TWITCH_REFRESH_TOKEN,
        },
      });

      const token = res.data.access_token;
      const expiresAt = Date.now() + res.data.expires_in * 1000 - 60000;
      this.userAccessToken = { token, expiresAt };
      logger.debug('Twitch User Access Token refreshed');
      return token;
    } catch (error) {
      logger.error('Failed to refresh Twitch User Access Token:', error);
      return null;
    }
  }

  private async getHeaders(useUserToken = false) {
    const token = useUserToken ? await this.getUserAccessToken() : await this.getAppAccessToken();
    return {
      'Client-ID': env.TWITCH_CLIENT_ID!,
      Authorization: `Bearer ${token}`,
    };
  }

  async getUserByLogin(login: string): Promise<TwitchUser | null> {
    try {
      const headers = await this.getHeaders();
      const res = await axios.get('https://api.twitch.tv/helix/users', {
        headers,
        params: { login },
      });
      const user = res.data.data?.[0];
      if (!user) return null;
      return {
        id: user.id,
        login: user.login,
        displayName: user.display_name,
        profileImageUrl: user.profile_image_url,
      };
    } catch (error) {
      logger.error(`Failed to get user by login ${login}:`, error);
      return null;
    }
  }

  async getUsersByIds(ids: string[]): Promise<TwitchUser[]> {
    const users: TwitchUser[] = [];
    try {
      const headers = await this.getHeaders();
      for (let i = 0; i < ids.length; i += 100) {
        const batch = ids.slice(i, i + 100);
        const res = await axios.get('https://api.twitch.tv/helix/users', {
          headers,
          params: { id: batch },
        });
        for (const u of res.data.data) {
          users.push({
            id: u.id,
            login: u.login,
            displayName: u.display_name,
            profileImageUrl: u.profile_image_url,
          });
        }
      }
    } catch (error) {
      logger.error('Failed to get users by IDs:', error);
    }
    return users;
  }

  async getStreamByUserId(userId: string): Promise<TwitchStream | null> {
    try {
      const headers = await this.getHeaders();
      const res = await axios.get('https://api.twitch.tv/helix/streams', {
        headers,
        params: { user_id: userId },
      });
      const stream = res.data.data?.[0];
      if (!stream) return null;
      return {
        id: stream.id,
        userId: stream.user_id,
        userName: stream.user_login,
        title: stream.title,
        gameName: stream.game_name,
        viewerCount: stream.viewer_count,
        startedAt: stream.started_at,
        thumbnailUrl: stream.thumbnail_url,
      };
    } catch (error) {
      logger.error(`Failed to get stream for user ${userId}:`, error);
      return null;
    }
  }

  async getRA3GameId(): Promise<string | null> {
    const headers = await this.getHeaders();
    const searchNames = ['Command & Conquer: Red Alert 3', 'Red Alert 3'];
    for (const name of searchNames) {
      try {
        const res = await axios.get('https://api.twitch.tv/helix/games', {
          headers,
          params: { name },
        });
        const games = res.data.data;
        if (games && games.length > 0) {
          const gameId = games[0].id;
          logger.info(`✅ Resolved RA3 game: '${games[0].name}' (ID: ${gameId})`);
          return gameId;
        }
      } catch (error) {
        logger.error(`Failed to resolve game ID for '${name}':`, error);
      }
    }
    logger.error('❌ Could not find Red Alert 3 on Twitch under any known name!');
    return null;
  }

  async getStreamsByGame(gameId: string, first = 100): Promise<TwitchStream[]> {
    try {
      const headers = await this.getHeaders();
      const res = await axios.get('https://api.twitch.tv/helix/streams', {
        headers,
        params: { game_id: gameId, first },
      });
      const streams = res.data.data || [];
      logger.debug(`Fetched ${streams.length} streams for game ${gameId}`);
      return streams.map((stream: any) => ({
        id: stream.id,
        userId: stream.user_id,
        userName: stream.user_login,
        title: stream.title,
        gameName: stream.game_name,
        viewerCount: stream.viewer_count,
        startedAt: stream.started_at,
        thumbnailUrl: stream.thumbnail_url,
      }));
    } catch (error) {
      logger.error(`Failed to fetch streams for game ${gameId}:`, error);
      return [];
    }
  }
}

export const twitchService = new TwitchService();
