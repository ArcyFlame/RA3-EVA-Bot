import { describe, it, expect } from 'vitest';
import {
  parseTournaments,
  parsePortalDate,
  isTournamentRelevant,
  extractSignUpUrl,
  extractArticleDescription,
  extractEventFacts,
  findResultsTopic,
} from '../../src/services/tournament-scanner.service';

const FIXTURE = `
<div class="content_list_item">
  <div class="content_type">eSports<br /></div>
  <h3 class="content_list_title"><a href="https://www.gamereplays.org/redalert3/portals.php?show=page&name=gathering-storm">Gathering Storm Tournament</a></h3>
  <div class="content_list_infobar">Wednesday, 28 Jan 2026</div>
  Greetings Comrades, the tournament is announced!
</div>
<div class="content_list_item">
  <div class="content_type">eSports<br /></div>
  <h3 class="content_list_title"><a href="https://www.gamereplays.org/redalert3/portals.php?show=page&name=xmas_2025">XMAS2025</a></h3>
  <div class="content_list_infobar">Monday, 15 Dec 2025</div>
  The XMAS tournament.
</div>
`;

describe('parseTournaments', () => {
  it('parses title, url, date and excerpt', () => {
    const items = parseTournaments(FIXTURE);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe('Gathering Storm Tournament');
    expect(items[0].url).toContain('name=gathering-storm');
    expect(items[0].dateText).toContain('28 Jan 2026');
    expect(items[0].excerpt).toContain('tournament is announced');
  });

  it('skips items without a title link', () => {
    const items = parseTournaments('<div class="content_list_item">no link here</div>');
    expect(items).toHaveLength(0);
  });
});

describe('parsePortalDate', () => {
  it('parses a portal date', () => {
    const ts = parsePortalDate('Wednesday, 28 Jan 2026');
    expect(ts).not.toBeNull();
    expect(new Date(ts!).getFullYear()).toBe(2026);
  });

  it('returns null for an unparseable date', () => {
    expect(parsePortalDate('no date here')).toBeNull();
  });
});

describe('isTournamentRelevant', () => {
  it('keeps announcements', () => {
    expect(isTournamentRelevant('FTW 91 Registration')).toBe(true);
    expect(isTournamentRelevant('RA3 Masters')).toBe(true);
    expect(isTournamentRelevant('Operation Sigma 2v2')).toBe(true);
  });

  it('excludes results posts and mods', () => {
    expect(isTournamentRelevant('RA3 Masters Brackets, Replays and Streams')).toBe(false);
    expect(isTournamentRelevant('Rise of the Patch, Bracket Results and Replays')).toBe(false);
    expect(isTournamentRelevant('Generals Evolution tournament 2v2')).toBe(false);
  });
});

describe('extractSignUpUrl', () => {
  it('extracts the sign-up link and makes it absolute', () => {
    const html = '<a href="/community/index.php?showtopic=1083683">Sign up now!</a>';
    expect(extractSignUpUrl(html)).toBe(
      'https://www.gamereplays.org/community/index.php?showtopic=1083683',
    );
  });

  it('returns undefined when no sign-up link', () => {
    expect(extractSignUpUrl('<a href="/other">x</a>')).toBeUndefined();
  });
});

describe('extractArticleDescription', () => {
  it('extracts the article body', () => {
    const html = '<div class="contentpadding">Greetings Comrades, prize pool 380$</div>';
    expect(extractArticleDescription(html)).toContain('prize pool 380$');
  });
});

describe('extractEventFacts', () => {
  it('formats prize as amount - sponsored by', () => {
    const facts = extractEventFacts(
      'Prize pool for this event is 30$ sponsored by Mediastorm. Format: single elimination.',
    );
    expect(facts.prizePool).toBe('30$ - sponsored by Mediastorm');
  });

  it('handles sponsor-only prizes', () => {
    const facts = extractEventFacts('Prize pool sponsored by Mediastorm. Format: bo3.');
    expect(facts.prizePool).toBe('Sponsored by Mediastorm');
  });

  it('extracts a whitespace-collapsed map pool by known map names', () => {
    const facts = extractEventFacts(
      'Map pool for this event: Battlebase Alpha Battlebase Delta Deep Cold Erebor Lament Grinderberg Isla Pascua Misty Abyss Pacific Paradise Scorching Sands Thermal Tension Lake of Albatross Prize pool 30$',
    );
    expect(facts.maps).toContain('Battlebase Alpha');
    expect(facts.maps).toContain('Lake of Albatross');
    expect(facts.maps).toContain('Thermal Tension');
    // The map list must stop before the next section.
    expect(facts.maps).not.toContain('Prize');
  });
});

describe('findResultsTopic', () => {
  const forumHtml = `
    <a href="https://www.gamereplays.org/community/index.php?showtopic=1083648">Red Alert 3: Community Patch 1.12.8 Released</a>
    <a href="https://www.gamereplays.org/community/index.php?showtopic=1083797">Rise of the Patch Bracket, Results and Replays</a>
    <a href="https://www.gamereplays.org/community/index.php?showtopic=1083683">Registration for: Rise of the patch</a>
    <a href="https://www.gamereplays.org/community/index.php?showtopic=1082888">XMAS 2025 Brackets, Replays and Streams</a>
  `;

  it('matches the results thread by tournament name', async () => {
    const topic = await findResultsTopic('Rise of the Patch', async () => forumHtml);
    expect(topic?.title).toBe('Rise of the Patch Bracket, Results and Replays');
    expect(topic?.url).toContain('showtopic=1083797');
  });

  it('prefers the shortest fully-matching results thread', async () => {
    const topic = await findResultsTopic('XMAS 2025', async () => forumHtml);
    expect(topic?.title).toContain('XMAS 2025');
  });

  it('returns null when nothing matches', async () => {
    const topic = await findResultsTopic('Unknown Event Zzz', async () => forumHtml);
    expect(topic).toBeNull();
  });
});
