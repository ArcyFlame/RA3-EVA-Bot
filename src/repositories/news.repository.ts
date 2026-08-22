import { BaseRepository } from './base.repository';

export interface NewsItem {
  id: number;
  newsUrl: string;
  title: string;
  excerpt?: string;
  postedAt: string;
}

export class NewsRepository extends BaseRepository {
  hasNewsUrl(newsUrl: string): boolean {
    const row = this.query<{ id: number }>('SELECT id FROM news_items WHERE news_url = ?', [newsUrl]);
    return !!row;
  }

  create(data: { newsUrl: string; title: string; excerpt?: string }): void {
    this.run('INSERT INTO news_items (news_url, title, excerpt) VALUES (?, ?, ?)', [
      data.newsUrl,
      data.title,
      data.excerpt ?? null,
    ]);
  }

  /** Newest-first list for the /news browser. */
  getLatest(limit = 20): NewsItem[] {
    return this.queryAll<{ id: number; news_url: string; title: string; excerpt: string | null; posted_at: string }>(
      'SELECT id, news_url, title, excerpt, posted_at FROM news_items ORDER BY id DESC LIMIT ?',
      [limit],
    ).map((r) => ({
      id: r.id,
      newsUrl: r.news_url,
      title: r.title,
      excerpt: r.excerpt ?? undefined,
      postedAt: r.posted_at,
    }));
  }
}

export const newsRepository = new NewsRepository();
