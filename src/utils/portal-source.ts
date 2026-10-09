import * as cheerio from 'cheerio';

export function portalArticleUrl(href: string): string | undefined {
  try {
    const url = new URL(href, 'https://www.gamereplays.org/redalert3/');
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      (url.port && url.port !== '443') ||
      !['gamereplays.org', 'www.gamereplays.org'].includes(url.hostname) ||
      (!url.pathname.startsWith('/redalert3/') && url.pathname !== '/portals.php') ||
      url.pathname.endsWith('/')
    )
      return undefined;
    url.protocol = 'https:';
    if (
      url.pathname.endsWith('portals.php') &&
      !['page', 'news'].includes(url.searchParams.get('show') ?? '')
    )
      return undefined;
    url.hash = '';
    return url.toString();
  } catch {
    return undefined;
  }
}

/** Semantic headings/time elements supplement the legacy portal CSS selectors. */
export function parsePortalCards(html: string) {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const cards: Array<{
    title: string;
    url: string;
    dateText: string;
    excerpt: string;
    type: string;
    image?: string;
  }> = [];
  $('.content_list_item, article, .news-item, .tournament-item').each((_, element) => {
    const card = $(element);
    const link = card.find('.content_list_title a, h2 a, h3 a, a[rel="bookmark"]').first();
    const url = portalArticleUrl(link.attr('href') ?? '');
    const title = link.text().replace(/\s+/g, ' ').trim();
    if (!url || !title || seen.has(url)) return;
    const time = card.find('time').first();
    const dateText =
      time.attr('datetime') ||
      time.text().trim() ||
      card.find('.content_list_infobar, .published-date').first().text().trim();
    const type =
      card.find('.content_type, [data-content-type]').first().text().trim() ||
      card.attr('data-content-type') ||
      '';
    const copy = card.clone();
    copy
      .find(
        '.content_list_title, h2, h3, .content_list_infobar, .content_type, time, .published-date, .portal_news_preview_footer, script, style',
      )
      .remove();
    const style = card.find('.content_list_thumbnail').first().attr('style') || '';
    const image =
      style.match(/url\((['"]?)(.*?)\1\)/i)?.[2] ||
      card.find('img').first().attr('data-src') ||
      card.find('img').first().attr('src');
    cards.push({
      title,
      url,
      dateText,
      type,
      image,
      excerpt: copy.text().replace(/\s+/g, ' ').trim().slice(0, 300),
    });
    seen.add(url);
  });
  return cards;
}
