import axios from 'axios';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export interface YouTubeChannel {
  id: string;
  title: string;
  thumbnail?: string;
}

export interface YouTubeVideo {
  id: string;
  channelId: string;
  title: string;
  publishedAt?: string;
  isLive: boolean;
}

export class YouTubeService {
  private readonly apiKey: string | undefined;

  constructor() {
    // Do NOT throw here: youtube.service is imported at boot even when YouTube
    // is unconfigured (env.YOUTUBE_API_KEY is optional). Methods below degrade
    // gracefully when the key is absent.
    this.apiKey = env.YOUTUBE_API_KEY;
  }

  async getChannelIdFromHandle(handle: string): Promise<string | null> {
    if (!this.apiKey) {
      logger.warn('YouTube API key missing - cannot resolve handle');
      return null;
    }
    const cleanHandle = handle.replace('@', '');
    const url = 'https://www.googleapis.com/youtube/v3/channels';
    try {
      const res = await axios.get(url, {
        params: { part: 'id', forHandle: cleanHandle, key: this.apiKey },
      });
      return res.data.items?.[0]?.id || null;
    } catch (error) {
      logger.error(`YouTube handle resolution failed for ${handle}:`, error);
      return null;
    }
  }

  async getChannelInfo(channelId: string): Promise<YouTubeChannel | null> {
    if (!this.apiKey) return null;
    const url = 'https://www.googleapis.com/youtube/v3/channels';
    try {
      const res = await axios.get(url, {
        params: { part: 'snippet', id: channelId, key: this.apiKey },
      });
      const item = res.data.items?.[0];
      if (!item) return null;
      return {
        id: item.id,
        title: item.snippet.title,
        thumbnail: item.snippet.thumbnails?.default?.url,
      };
    } catch (error) {
      logger.error(`YouTube channel info failed for ${channelId}:`, error);
      return null;
    }
  }

  async getVideoInfo(videoId: string): Promise<YouTubeVideo | null> {
    if (!this.apiKey) return null;
    const url = 'https://www.googleapis.com/youtube/v3/videos';
    try {
      const res = await axios.get(url, {
        params: { part: 'snippet,liveStreamingDetails', id: videoId, key: this.apiKey },
      });
      const item = res.data.items?.[0];
      if (!item) return null;
      const isLive = !!(item.snippet.liveBroadcastContent === 'live' || item.liveStreamingDetails);
      return {
        id: item.id,
        channelId: item.snippet.channelId,
        title: item.snippet.title,
        publishedAt: item.snippet.publishedAt,
        isLive,
      };
    } catch (error) {
      logger.error(`YouTube video info failed for ${videoId}:`, error);
      return null;
    }
  }

  /** Latest uploads of a channel (newest first) via its uploads playlist. */
  async getRecentUploads(channelId: string, limit = 5): Promise<YouTubeVideo[]> {
    if (!this.apiKey) return [];
    try {
      const channelsRes = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
        params: { part: 'contentDetails', id: channelId, key: this.apiKey },
        timeout: 10_000,
      });
      const uploadsPlaylistId =
        channelsRes.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploadsPlaylistId) return [];
      const res = await axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
        params: {
          part: 'snippet',
          playlistId: uploadsPlaylistId,
          maxResults: limit,
          key: this.apiKey,
        },
        timeout: 10_000,
      });
      return (res.data.items || []).map((item: any) => ({
        id: item.snippet.resourceId.videoId,
        channelId,
        title: item.snippet.title,
        publishedAt: item.snippet.publishedAt,
        isLive: false,
      }));
    } catch (error) {
      logger.warn(`YouTube recent uploads failed for ${channelId}:`, error);
      return [];
    }
  }

  getFeedUrl(channelId: string): string {
    return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  }

  getPubSubHubUrl(): string {
    return 'https://pubsubhubbub.appspot.com/subscribe';
  }
}

export const youTubeService = new YouTubeService();
