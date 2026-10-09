import xml2js from 'xml2js';

type FeedValue = Record<string, unknown>;
function text(value: unknown): string {
  if (Array.isArray(value)) return text(value[0]);
  if (value && typeof value === 'object') return text((value as FeedValue)._);
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}
function attributes(value: unknown): FeedValue {
  if (Array.isArray(value)) return attributes(value[0]);
  return ((value && typeof value === 'object' ? (value as FeedValue).$ : {}) as FeedValue) || {};
}

export interface SourceFeedItem {
  title: string;
  url: string;
  publishedAt: string;
  description: string;
  guid: string;
  image?: string;
}

/** RSS and Atom share one validated adapter; unrecognized documents are failures, not empty feeds. */
export async function parseSourceFeed(
  xml: string,
  baseUrl = 'https://www.moddb.com/',
): Promise<SourceFeedItem[]> {
  const parsed = await new xml2js.Parser({ explicitArray: false }).parseStringPromise(xml);
  const channel = parsed?.rss?.channel;
  const feed = parsed?.feed;
  if (!channel && !feed) throw new Error('Source feed layout is not recognized');
  const items = channel?.item ?? feed?.entry ?? [];
  return (Array.isArray(items) ? items : [items]).slice(0, 1000).flatMap((item: FeedValue) => {
    const links = Array.isArray(item.link) ? item.link : [item.link];
    const alternate = links.find((link: unknown) => {
      const attr = attributes(link);
      return !attr.rel || attr.rel === 'alternate';
    });
    const href = String(attributes(alternate).href || text(alternate));
    let url: URL;
    try {
      url = new URL(href, baseUrl);
    } catch {
      return [];
    }
    if (
      !href ||
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      (url.port && url.port !== '443') ||
      !['www.moddb.com', 'moddb.com'].includes(url.hostname) ||
      url.pathname === '/'
    )
      return [];
    url.protocol = 'https:';
    url.hash = '';
    const title = text(item.title);
    if (!title) return [];
    return [
      {
        title,
        url: url.toString(),
        publishedAt: text(item.pubDate ?? item.published ?? item.updated),
        description: text(item.description ?? item.content ?? item.summary),
        guid: text(item.guid ?? item.id) || url.toString(),
        image:
          text(
            attributes(item['media:content']).url ||
              attributes(item['media:thumbnail']).url ||
              attributes(item.enclosure).url,
          ) || undefined,
      },
    ];
  });
}
