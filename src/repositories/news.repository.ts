import { BaseRepository } from './base.repository';
import { GameId } from '../config/games';

export interface NewsItem {
  id: number;
  game: GameId;
  newsUrl: string;
  title: string;
  excerpt?: string;
  imageUrl?: string;
  postedAt: string;
}

export class NewsRepository extends BaseRepository {
  hasNewsUrl(newsUrl: string, game: GameId): boolean {
    const row = this.query<{ id: number }>(
      'SELECT id FROM news_items WHERE news_url = ? AND game = ?',
      [newsUrl, game],
    );
    return !!row;
  }

  create(data: {
    game: GameId;
    newsUrl: string;
    title: string;
    excerpt?: string;
    imageUrl?: string;
  }): void {
    this.run(
      `INSERT INTO news_items (news_url, title, excerpt, game, image_url)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(news_url) DO UPDATE SET
         title = excluded.title,
         excerpt = COALESCE(excluded.excerpt, excerpt),
         image_url = COALESCE(excluded.image_url, image_url),
         game = excluded.game`,
      [data.newsUrl, data.title, data.excerpt ?? null, data.game, data.imageUrl ?? null],
    );
  }

  /** Newest-first list for the /news browser. */
  getLatest(limit = 20, game: GameId = 'ra3'): NewsItem[] {
    return this.queryAll<{
      id: number;
      game: GameId;
      news_url: string;
      title: string;
      excerpt: string | null;
      image_url: string | null;
      posted_at: string;
    }>(
      'SELECT id, game, news_url, title, excerpt, image_url, posted_at FROM news_items WHERE game = ? ORDER BY id DESC LIMIT ?',
      [game, limit],
    ).map((r) => ({
      id: r.id,
      game: r.game,
      newsUrl: r.news_url,
      title: r.title,
      excerpt: r.excerpt ?? undefined,
      imageUrl: r.image_url ?? undefined,
      postedAt: r.posted_at,
    }));
  }
}

export const newsRepository = new NewsRepository();
