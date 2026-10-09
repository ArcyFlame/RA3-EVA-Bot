import { beforeAll, describe, expect, it, vi } from 'vitest';
import { parseSourceFeed } from '../../src/utils/source-feed';
import {
  ChallongeService,
  parseChallongeMatches,
  parseChallongeParticipants,
} from '../../src/services/challonge.service';
import {
  parseTournaments,
  extractArticleDescription,
  extractArticleImage,
  tournamentScanner,
} from '../../src/services/tournament-scanner.service';
import { parseRa3PortalNews } from '../../src/services/news-scanner.service';
import { editionsCompatible, parseTopicPage } from '../../src/services/forum-scanner.service';
import { connectDatabase } from '../../src/database/connection';
import { tournamentRepository as repo } from '../../src/repositories/tournament.repository';
import { safeGetText } from '../../src/utils/safe-fetch';
import { db } from '../../src/database/sqlite';
import { up as migrateReminders } from '../../src/database/migrations/033_match_reminder_delivery';

vi.mock('../../src/utils/safe-fetch', () => ({ safeGetText: vi.fn(), sourceGet: vi.fn() }));
beforeAll(connectDatabase);

describe('source schema and layout changes', () => {
  it('preserves an organizer community bracket URL rather than guessing a main-site slug', () => {
    const service = new ChallongeService();
    const ref = service.parseTournamentRef('http://neworganizer.challonge.com/en/cup92');
    expect(ref).toBe('neworganizer-cup92');
    expect(service.bracketUrl(ref!)).toBe('https://neworganizer.challonge.com/cup92');
    expect(service.parseTournamentRef('https://challonge.com.evil.example/cup92')).toBeNull();
  });
  it('accepts RSS and Atom without inventing missing publication dates', async () => {
    const rss =
      await parseSourceFeed(`<rss><channel><item><title>Cup</title><link>http://www.moddb.com/mods/example/news/cup</link>
      <description>&lt;p&gt;Tournament&lt;/p&gt;</description><guid isPermaLink="false">cup-id</guid></item></channel></rss>`);
    const atom =
      await parseSourceFeed(`<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Cup</title>
      <link rel="self" href="https://rss.moddb.com/internal"/><link rel="alternate" href="https://www.moddb.com/mods/example/news/cup"/>
      <id>cup-id</id><published>2026-10-09T12:00:00Z</published><content type="html">&lt;p&gt;Tournament&lt;/p&gt;</content></entry></feed>`);
    expect(rss[0]).toMatchObject({
      url: 'https://www.moddb.com/mods/example/news/cup',
      publishedAt: '',
      guid: 'cup-id',
    });
    expect(atom[0]).toMatchObject({
      guid: 'cup-id',
      description: '<p>Tournament</p>',
      publishedAt: '2026-10-09T12:00:00Z',
    });
    await expect(parseSourceFeed('<html>Maintenance</html>')).rejects.toThrow('layout');
    expect(
      await parseSourceFeed('<rss><channel><title>Empty feed</title></channel></rss>'),
    ).toEqual([]);
    expect(
      await parseSourceFeed(
        '<rss><channel><item><title>Bad</title><link>https://evil.example/news</link></item></channel></rss>',
      ),
    ).toEqual([]);
  });

  it('supports semantic cards and lazy article images while rejecting navigation and foreign links', () => {
    const html = `<article data-content-type="eSports"><h2><a href="/redalert3/portals.php?show=page&amp;name=cup">FTW 92 Registration</a></h2>
      <time datetime="2026-10-09">Today</time><p>New competition.</p></article>
      <article><h3><a href="/redalert3/news/server-update">Server update</a></h3><p>New news.</p><img data-src="/community/uploads/update.jpg"></article>
      <article><h2><a href="https://evilgamereplays.org/redalert3/news/evil">Unsafe</a></h2></article>
      <article><h2><a href="/redalert3/portals.php?show=esports">Navigation</a></h2></article>`;
    const cards = parseTournaments(html);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      title: 'FTW 92 Registration',
      dateText: '2026-10-09',
      excerpt: 'New competition.',
    });
    expect(parseRa3PortalNews(html)).toMatchObject([
      {
        title: 'Server update',
        imageUrl: 'https://www.gamereplays.org/community/uploads/update.jpg',
      },
    ]);
    const body =
      '<main><article><p>Prize pool $250. Single elimination.</p><img data-src="/community/uploads/cup.jpg"><script>garbage</script></article></main>';
    expect(extractArticleDescription(body)).toBe('Prize pool $250. Single elimination.');
    expect(extractArticleImage(body)).toBe('https://www.gamereplays.org/community/uploads/cup.jpg');
    expect(extractArticleDescription('<html>Maintenance</html>')).toBeUndefined();
  });

  it('keeps editions apart even when format, patch version, year or prize numbers coincide', () => {
    expect(editionsCompatible('FTW 90 1v1 BO5 1.12.8', 'FTW 88 1v1 BO5 1.12.8')).toBe(false);
    expect(editionsCompatible('FTW 90 2026', 'FTW 88 2026')).toBe(false);
    expect(editionsCompatible('FTW 90 2v2 250$', 'FTW 90 Registration')).toBe(true);
  });

  it('does not adopt links from replies, signatures or quoted older brackets', () => {
    const parsed =
      parseTopicPage(`<div class="post_body"><a href="https://challonge.com/new-host-cup">Bracket</a>
      <blockquote><a href="https://challonge.com/old-cup">Old bracket</a></blockquote>
      <div class="signature"><a href="https://challonge.com/signature-cup">Signature</a></div></div>
      <div class="post_body"><a href="https://challonge.com/other-cup">Reply</a></div>`);
    expect(parsed.challonge).toEqual(['https://challonge.com/new-host-cup']);
  });

  it('normalizes wrapped/unwrapped/data-envelope responses and rejects malformed provider contracts', () => {
    const m = {
      id: '1',
      tournament_id: '2',
      state: 'complete',
      player1_id: '3',
      player2_id: 4,
      winner_id: 3,
      scores_csv: '2-1',
    };
    expect(parseChallongeMatches([{ match: m }])).toEqual(parseChallongeMatches([m]));
    expect(parseChallongeMatches({ data: [m] })[0]).toMatchObject({ id: 1, winnerId: 3 });
    const p = { id: 3, name: 'Player', tournament_id: 2, final_rank: 1 };
    expect(parseChallongeParticipants({ data: [{ id: '3', attributes: p }] })).toMatchObject({
      rankings: [{ rank: 1, name: 'Player', id: 3 }],
    });
    for (const data of [
      { error: 'Quota exceeded' },
      '<html>Maintenance</html>',
      [{}],
      [{ match: { ...m, state: 'new-unknown-state' } }],
    ])
      expect(() => parseChallongeMatches(data)).toThrow();
    expect(() => parseChallongeParticipants([{ ...p, id: '9007199254740993' }])).toThrow();
    expect(() => parseChallongeParticipants([{ ...p, name: null }])).toThrow();
  });
});

describe('verified data survives scanner failures', () => {
  it('does not clear existing article links, details or facts on an unrecognized article body', async () => {
    const url = 'https://www.gamereplays.org/redalert3/portals.php?show=page&name=resilient';
    const id = repo.createEvent({
      game: 'ra3',
      eventUrl: url,
      title: 'Resilient Cup',
      description: 'Full verified description.',
      announcedAt: new Date().toISOString(),
      signUpUrl: 'https://www.gamereplays.org/community/index.php?showtopic=123',
      format: '2V2',
      prizePool: '250$',
      maps: 'Coastal Confrontation',
    });
    vi.mocked(safeGetText)
      .mockResolvedValueOnce(
        `<article><h2><a href="${url}">Resilient Cup</a></h2><p>Short excerpt.</p></article>`,
      )
      .mockResolvedValueOnce('<html>Maintenance</html>');
    await tournamentScanner.scan('ra3');
    expect(repo.getEventDetail(id)).toMatchObject({
      description: 'Full verified description.',
      format: '2V2',
      prizePool: '250$',
      maps: 'Coastal Confrontation',
    });
    repo.updateEventDetails(url, null, null, {});
    repo.updateEventFacts(id, {});
    expect(repo.getEventDetail(id)).toMatchObject({
      format: '2V2',
      prizePool: '250$',
      maps: 'Coastal Confrontation',
    });
    expect(
      (
        db.prepare('SELECT sign_up_url FROM tournament_events WHERE id = ?').get(id) as {
          sign_up_url: string;
        }
      ).sign_up_url,
    ).toContain('showtopic=123');
    repo.updateEventDetails(url, null, null, null);
    expect(repo.getEventDetail(id)?.format).toBeNull();
  });

  it('retains saved standings, participants and matches on an empty or partial refresh', () => {
    const url = 'https://challonge.com/resilient';
    repo.saveResultCache(url, {
      sourceType: 'challonge',
      rankings: [{ rank: 1, name: 'Winner', id: 1 }],
      participants: [{ id: 1, name: 'Winner', tournamentId: 2 }],
      matches: [{ id: 1, tournamentId: 2, state: 'complete' }],
    });
    repo.saveResultCache(url, {
      sourceType: 'challonge',
      rankings: [],
      participants: [],
      matches: [],
    });
    expect(repo.getResultCache(url)?.rankings?.[0].name).toBe('Winner');
    expect(repo.getResultCache(url)?.matches).toHaveLength(1);
  });

  it('migrates old sent reminders without scheduling repeat deliveries', () => {
    repo.recordMatchReminder('migration-test', '123', '1', 'p1', 'p2', null);
    const id = repo.getMatchReminder('migration-test', '123', '1')!.id;
    db.prepare(
      'UPDATE tournament_match_confirmations SET player1_notified = 0, player2_notified = 0 WHERE id = ?',
    ).run(id);
    migrateReminders();
    expect(repo.getMatchReminderById(id)).toMatchObject({ player1Notified: 1, player2Notified: 1 });
    expect(repo.claimReminderDelivery(id, 'p1')).toBe(false);
  });
});
