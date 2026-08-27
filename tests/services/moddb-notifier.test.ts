import { describe, expect, it } from 'vitest';
import {
  cleanModdbDescription,
  extractModdbImage,
} from '../../src/services/moddb-notifier.service';

describe('ModDB feed formatting', () => {
  it('removes literal escaped HTML from descriptions', () => {
    const source =
      '&lt;img src="https://media.moddb.com/images/articles/1/hero.jpg" /&gt;&lt;br /&gt;Thank you for your love and support.';
    expect(cleanModdbDescription(source)).toBe('Thank you for your love and support.');
  });

  it('keeps a valid ModDB post image', () => {
    expect(
      extractModdbImage(
        '<img src="https://media.moddb.com/images/articles/1/hero.jpg">',
        'https://www.moddb.com/mods/example/news/update',
      ),
    ).toBe('https://media.moddb.com/images/articles/1/hero.jpg');
    expect(
      extractModdbImage(
        'https://media.moddb.com/images/articles/1/feed-image.png',
        'https://www.moddb.com/mods/example/news/update',
      ),
    ).toBe('https://media.moddb.com/images/articles/1/feed-image.png');
  });
});
