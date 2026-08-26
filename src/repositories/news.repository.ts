import { BaseRepository } from './base.repository';
import { GameId } from '../config/games';

export interface NewsItem {
  id: number;
  game: GameId;
  newsUrl: string;
  title: string;
  excerpt?: string;
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

  create(data: { game: GameId; newsUrl: string; title: string; excerpt?: string }): void {
    this.run('INSERT INTO news_items (news_url, title, excerpt, game) VALUES (?, ?, ?, ?)', [
      data.newsUrl,
      data.title,
      data.excerpt ?? null,
      data.game,
    ]);
  }

  /** Newest-first list for the /news browser. */
  getLatest(limit = 20, game: GameId = 'ra3'): NewsItem[] {
    return this.queryAll<{
      id: number;
      game: GameId;
      news_url: string;
      title: string;
      excerpt: string | null;
      posted_at: string;
    }>(
      'SELECT id, game, news_url, title, excerpt, posted_at FROM news_items WHERE game = ? ORDER BY id DESC LIMIT ?',
      [game, limit],
    ).map((r) => ({
      id: r.id,
      game: r.game,
      newsUrl: r.news_url,
      title: r.title,
      excerpt: r.excerpt ?? undefined,
      postedAt: r.posted_at,
    }));
  }
}

export const newsRepository = new NewsRepository();
