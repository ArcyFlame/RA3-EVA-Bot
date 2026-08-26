import { describe, it, expect } from 'vitest';
import {
  parseTournaments,
  parsePortalDate,
  isTournamentRelevant,
  extractSignUpUrl,
  extractArticleDescription,
  extractEventFacts,
  findResultsTopic,
  parseGenevoTournaments,
  extractEventStartDate,
  isGenevoTournamentTitle,
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

describe('isGenevoTournamentTitle', () => {
  it('keeps GenEvo announcements without mixing them into results posts', () => {
    expect(isGenevoTournamentTitle('Generals Evolution tournament 2v2')).toBe(true);
    expect(isGenevoTournamentTitle('Gen Evo Summer Cup Registration')).toBe(true);
    expect(isGenevoTournamentTitle('Generals Evolution Bracket and Results')).toBe(false);
    expect(isGenevoTournamentTitle('FTW 91 Registration')).toBe(false);
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

  it('keeps map pools that appear after the first 4,000 characters', () => {
    const html = `<div class="contentpadding">${'Intro '.repeat(800)}Map pool: Corporate Warfare 1.12.6</div>`;
    expect(extractArticleDescription(html)).toContain('Corporate Warfare');
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

  it('reads the comma-style FTW map-pool heading', () => {
    const facts = extractEventFacts(
      'DE Map pool, using 1.12.6 versions! Battlebase Beta Cabana Republic Deep Sea V2 Fire Island Infinity Isle Industrial Strength Libration Freeze V2 Snow Plow Temple Prime Format Single Elimination',
    );
    expect(facts.maps).toContain('Battlebase Beta');
    expect(facts.maps).toContain('Temple Prime');
  });

  it('merges the 2v2 and 1v1 map-pool sections from a combined XMAS event', () => {
    const facts = extractEventFacts(
      '2vs2 Map pool, using 1.12.6 versions! Corporate Warfare Isla Nooblar Shoguns Alley Format details. 1vs1 DE Map pool, using 1.12.6 versions! Battlebase Beta Cabana Republic Infinity Isle Fair Play rules.',
    );
    expect(facts.maps).toContain('Corporate Warfare');
    expect(facts.maps).toContain('Battlebase Beta');
  });

  it('recognizes Generals Evolution map identifiers in its own event feed', () => {
    const facts = extractEventFacts(
      'Map pool: GenEvo033 Aymcam Skrm 01, GenEvo033 Sgor00 Skrm 25 Prize: 50$',
      'genevo',
    );
    expect(facts.maps).toContain('GenEvo033 Aymcam Skrm 01');
    expect(facts.maps).toContain('GenEvo033 sgor00 Skrm 25');
  });

  it('extracts the full GenEvo 2v2 prize and sponsor list', () => {
    const facts = extractEventFacts(
      'The event will be taking place March 14th at 14:00 GMT. The total cash prize pool for this event is 250$ and is sponsored by SpamAltf4 (100$), Khay (100$), and Daytor (50$). The 1st place prize is worth 100$. This event will be a SINGLE ELIMINATION 2vs2.',
      'genevo',
      'Sunday, 1 Mar 2026',
    );
    expect(facts.prizePool).toBe(
      '250$ - sponsored by SpamAltf4 (100$), Khay (100$), and Daytor (50$)',
    );
    expect(facts.format).toBe('2V2 - Single Elimination');
    expect(facts.startDate).toBe('14 Mar 2026, 14:00 GMT');
  });
});

describe('extractEventStartDate', () => {
  it('uses the publication year when the announcement omits it', () => {
    expect(
      extractEventStartDate(
        'The event will be taking place March 14th at 14:00 GMT.',
        'Sunday, 1 Mar 2026',
      ),
    ).toBe('14 Mar 2026, 14:00 GMT');
  });

  it('reads the numeric date format used by Rise of the Patch and FTW 90', () => {
    expect(
      extractEventStartDate(
        'FTW 90 will be a Single Elimination tournament beginning on 29.06.2025 12:45 GMT.',
        'Wednesday, 17 Sep 2025',
      ),
    ).toBe('29 Jun 2025, 12:45 GMT');
  });

  it('reads "December the 21th" and keeps the publication year', () => {
    expect(
      extractEventStartDate(
        '2vs2 Xmas 2025 will consist of a tourney beginning on December the 21th.',
        'Monday, 15 Dec 2025',
      ),
    ).toBe('21 Dec 2025');
  });
});

describe('parseGenevoTournaments', () => {
  it('keeps event announcements and ignores ordinary update articles', async () => {
    const xml = `<?xml version="1.0"?><rss><channel>
      <item><title>Summer Cup Registration</title><link>https://www.moddb.com/events/summer</link><pubDate>Tue, 25 Aug 2026 12:00:00 GMT</pubDate><description><![CDATA[Sign up for the next Generals Evolution tournament.]]></description></item>
      <item><title>Version 0.34 development update</title><link>https://www.moddb.com/articles/update</link><description><![CDATA[New units and balance changes.]]></description></item>
    </channel></rss>`;
    const items = await parseGenevoTournaments(xml);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Summer Cup Registration');
    expect(items[0].description).toContain('next Generals Evolution tournament');
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
