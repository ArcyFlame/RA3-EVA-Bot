import { describe, expect, it } from 'vitest';
import { parseRa3PortalNews, RA3_NEWS_URL } from '../../src/services/news-scanner.service';

describe('parseRa3PortalNews', () => {
  it('reads News cards and ignores mixed portal article and esports cards', () => {
    const html = `
      <div class="content_list_item">
        <span class="content_type">News</span>
        <div class="content_list_thumbnail" style="background: url(https://www.gamereplays.org/community/uploads/news-card.jpg);"></div>
        <h3 class="content_list_title"><a href="/redalert3/portals.php?show=news&amp;news_id=1">C&amp;C:Online Server Changes</a></h3>
        <div class="content_list_infobar">May 24, 2026</div>
        Connection details for Red Alert 3 players.
      </div>
      <div class="content_list_item">
        <span class="content_type">Article</span>
        <h3 class="content_list_title"><a href="/redalert3/portals.php?show=page&amp;name=patch">Patch article</a></h3>
      </div>
      <div class="content_list_item">
        <span class="content_type">eSports</span>
        <h3 class="content_list_title"><a href="/redalert3/portals.php?show=page&amp;name=event">Tournament</a></h3>
      </div>
      <div class="content_list_item">
        <span class="content_type">News</span>
        <h3 class="content_list_title"><a href="http://www.gamereplays.org/redalert3/news/2">Naval Play</a></h3>
        A strategy update.
      </div>`;

    const parsed = parseRa3PortalNews(html);
    expect(parsed.map((item) => item.title)).toEqual(['C&C:Online Server Changes', 'Naval Play']);
    expect(parsed[0].url).toBe(
      'https://www.gamereplays.org/redalert3/portals.php?show=news&news_id=1',
    );
    expect(parsed[0].excerpt).toBe('Connection details for Red Alert 3 players.');
    expect(parsed[0].imageUrl).toBe('https://www.gamereplays.org/community/uploads/news-card.jpg');
    expect(parsed[1].url.startsWith('https://')).toBe(true);
  });

  it('uses the dedicated Red Alert 3 news index', () => {
    expect(RA3_NEWS_URL).toBe('https://www.gamereplays.org/redalert3/portals.php?show=news_index');
  });
});
