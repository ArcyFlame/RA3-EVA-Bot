import { describe, it, expect } from 'vitest';
import {
  extractPrize,
  truncateSentences,
  baseName,
  editionsCompatible,
  parseRegistrations,
  parseRegistrationRoster,
  parseTopicPage,
  parseExplicitForumWinner,
  parseForumTopics,
  tournamentNamesMatch,
} from '../../src/services/forum-scanner.service';

describe('extractPrize', () => {
  it('sums a place table into the total prize pool', () => {
    expect(extractPrize('1st Place: 120$ 2nd Place: 80$ 3rd Place: 40$')).toBe('240$');
  });

  it('never reads $2 out of "120$2nd Place"', () => {
    // Whitespace-collapsed posts glue the amounts together; the old regex
    // matched "$2" from "120$2nd" and showed a $2 prize.
    expect(extractPrize('1st Place: 120$2nd Place: 80$3rd Place: 40$')).toBe('240$');
  });

  it('accepts dollar-before amounts', () => {
    expect(extractPrize('$40 Prize for the winner')).toBe('40$');
  });

  it('prefers the title amount', () => {
    expect(extractPrize('some text with 5$ mention', 'XMAS Registration -$40 Prize')).toBe('40$');
  });

  it('appends the sponsor when present', () => {
    expect(extractPrize('Prize pool 30$ sponsored by Mediastorm. Good luck.')).toBe(
      '30$ - sponsored by Mediastorm',
    );
  });

  it('splits amounts glued to ordinals in collapsed prize tables', () => {
    // Real Gathering Storm text after whitespace collapse: "1st $1111" +
    // "2nd $456" + "3rd $234" + "4th $123" + "5th/6th $99" + "7th/8th $50".
    expect(
      extractPrize('1st $11112nd $4563rd $2344th $1235th/6th $997th/8th $50 Each qualifier'),
    ).toBe('1111$');
  });

  it('prefers an explicit total prize pool', () => {
    expect(extractPrize('$2222 Total prize pool sponsored by Mediastorm. 1st $1111 2nd $456')).toBe(
      '2222$ - sponsored by Mediastorm',
    );
  });

  it('sums donations as the prize (Rise of the Patch 100+100+130+50 = 380$)', () => {
    expect(
      extractPrize(
        'Prizes: 100$ Donated by Medstar, 100 Donated by arachnidallfather, 130 Donated by HostEZ and 50$ Donated by XonurHead.',
      ),
    ).toBe('380$');
  });

  it('sums a single donation (FTW 91: 30$ Donated by Inspector RaGe)', () => {
    expect(extractPrize('30$ Donated by, Inspector RaGe.')).toBe('30$');
  });

  it('sums prize tables (FTW 91 thread: 1st 20$ + 2nd 10$ = 30$)', () => {
    expect(extractPrize('PRIZES 1st Place: 20$2nd Place: 10$ * Make sure you download 1.12')).toBe(
      '30$',
    );
  });

  it('sums grouped places and multi-draws (Rise of the Patch = 380$)', () => {
    expect(
      extractPrize(
        'PRIZES 1st Place: 120$2nd Place: 80$3rd & 4th Place: 60$2 Random draws: 30$ each',
      ),
    ).toBe('380$');
  });

  it('returns undefined when no real amount exists', () => {
    expect(extractPrize('2 random draws for lucky participants')).toBeUndefined();
  });
});

describe('truncateSentences', () => {
  it('keeps whole sentences when they fit', () => {
    expect(truncateSentences('One. Two. Three.', 200)).toBe('One. Two. Three.');
  });

  it('cuts at a sentence boundary and appends ...', () => {
    const text =
      'You will need to be set up with C&C: Online. Make sure you do that before the day of the tournament so we can start on time and nobody has to wait around for late installs.';
    const out = truncateSentences(text, 80);
    expect(out.endsWith('...')).toBe(true);
    expect(out).not.toMatch(/to$/);
    expect(out.length).toBeLessThanOrEqual(83);
  });

  it('never cuts mid-word when no sentence boundary fits', () => {
    const out = truncateSentences('aaaaaaaaaa bbbbbbbbbb cccccccccc dddddddddd', 25);
    expect(out).toBe('aaaaaaaaaa bbbbbbbbbb...');
  });
});

describe('baseName pairing', () => {
  it('maps a results twin to the same base name as its announcement', () => {
    expect(baseName('Rise of the Patch, Bracket Results and Replays')).toBe(
      baseName('Rise of the patch'),
    );
    // The actual sign-up thread title ("Registration for: Rise of the patch").
    expect(baseName('Registration for: Rise of the patch')).toBe(baseName('Rise of the patch'));
  });

  it('keeps FTW editions apart (91 never pairs with 88)', () => {
    const a = baseName('FTW 91 Registration -$40 Prize');
    const b = baseName('FTW #88 Brackets, Results and Replays');
    expect(a.startsWith('ftw 91')).toBe(true);
    expect(b.startsWith('ftw 88')).toBe(true);
    expect(a).not.toBe(b);
  });

  it('pairs editions only when numbers agree', () => {
    expect(editionsCompatible('FTW #88 Brackets, Results and Replays', 'FTW 91 Registration')).toBe(
      false,
    );
    expect(editionsCompatible('FTW 91 Brackets, Results and Replays', 'FTW 91 Registration')).toBe(
      true,
    );
    expect(
      editionsCompatible('Rise of the Patch, Bracket Results and Replays', 'Rise of the patch'),
    ).toBe(true);
  });

  it('pairs portal and forum spacing variants without merging FTW editions', () => {
    expect(tournamentNamesMatch('XMAS 2025 Brackets, Replays and Streams', 'XMAS2025')).toBe(true);
    expect(tournamentNamesMatch('FTW 90 Bracket, Results and Replays', 'FTW 90 Registration')).toBe(
      true,
    );
    expect(tournamentNamesMatch('FTW 88 Bracket, Results and Replays', 'FTW 90 Registration')).toBe(
      false,
    );
  });
});

describe('parseForumTopics', () => {
  it('uses the forum topic-title cells and ignores timestamps and sidebar duplicates', () => {
    const html = `
      <a href="index.php?showtopic=1083797">11th April 2026 - 17:22 PM</a>
      <div class="topic_title"><a href="https://www.gamereplays.org/community/index.php?s=0&amp;showtopic=1083797">Rise of the Patch Bracket, Results and Replays</a></div>
      <div class="topic_title"><a href="https://www.gamereplays.org/community/index.php?s=0&amp;showtopic=1083683">Registration for: Rise of the patch</a></div>
      <div class="topic_title"><a href="https://www.gamereplays.org/community/index.php?s=0&amp;showtopic=1081597">FTW 90 Bracket, Results and Replays</a></div>`;

    expect(parseForumTopics(html)).toEqual([
      {
        title: 'Rise of the Patch Bracket, Results and Replays',
        url: 'https://www.gamereplays.org/community/index.php?showtopic=1083797',
        kind: 'results',
      },
      {
        title: 'Registration for: Rise of the patch',
        url: 'https://www.gamereplays.org/community/index.php?showtopic=1083683',
        kind: 'registration',
      },
      {
        title: 'FTW 90 Bracket, Results and Replays',
        url: 'https://www.gamereplays.org/community/index.php?showtopic=1081597',
        kind: 'results',
      },
    ]);
  });
});

describe('parseTopicPage', () => {
  it('extracts a normal Challonge link', () => {
    const parsed = parseTopicPage('<a href="http://challonge.com/ftw91">Bracket</a>');
    expect(parsed.challonge).toEqual(['https://challonge.com/ftw91']);
  });

  it('recovers a Challonge link from malformed old forum BBCode', () => {
    const parsed = parseTopicPage(
      '<div class="comment">[url=https://challonge.com/z2dt9ono[/url]</div>',
    );
    expect(parsed.challonge).toEqual(['https://challonge.com/z2dt9ono']);
  });

  it('ignores Challonge website assets', () => {
    const parsed = parseTopicPage('<img src="https://challonge.com/images/logo.svg">');
    expect(parsed.challonge).toEqual([]);
  });
});

describe('parseExplicitForumWinner', () => {
  const post = (author: string, body: string) =>
    `<div class="comment_wrapper"><span class="member_name"><a>${author}</a></span>` +
    `<div class="comment">${body}</div></div>`;

  it('accepts a player-posted final score backed by the replay winner marker', () => {
    const html = post(
      'DutchArmy',
      'Finals<br>Forgot game 2<br>4-1<br>Player Name Side Team<br>DutchArmy* 0<br>GreenAlert 0',
    );
    expect(parseExplicitForumWinner(html)).toBe('DutchArmy');
  });

  it("does not guess from an organizer posting somebody else's score", () => {
    const html = post('Referee', 'Finals<br>DutchArmy 4-1 GreenAlert');
    expect(parseExplicitForumWinner(html)).toBeUndefined();
  });

  it('does not count an ordinary match report as a tournament final', () => {
    const html = post('DutchArmy', 'DutchArmy 4-1 GreenAlert<br>DutchArmy* 0');
    expect(parseExplicitForumWinner(html)).toBeUndefined();
  });
});

describe('parseRegistrationRoster', () => {
  const firstPost = (body: string) =>
    `<html><div class="comment_wrapper"><div class="comment_header"><span class="member_name"><a>CWEdvin</a></span></div><div class="comment">${body}</div></div></html>`;

  it('parses XMAS-style 2v2 teams and 1v1 lists from the first post', () => {
    const html = firstPost(
      `Registered for 2vs2:\n` +
        `Maximmoz and Otherdawn (team name - sons of dutch)\n` +
        `GreeeeeenAlert + DarkNage (Team name - NeverWin)\n` +
        `DachiMK + zaid646 (team name - The Sweets)\n` +
        `speranski and master_x (team name - Hello world)\n` +
        `Cordelia &amp; ManyakMerdo (team name: The Expendables)\n` +
        `Registered for 1vs1:\n` +
        `GreeeeeenAlert\n` +
        `Maximmoz\n` +
        `OtherDawn\n` +
        `Speranski\n` +
        `Zaid646\n` +
        `XMAS 2025 2vs2 registration closes at 12:45 GMT December 21st. CLOSED`,
    );
    const names = parseRegistrationRoster(html);
    expect(names).toContain('Maximmoz');
    expect(names).toContain('OtherDawn');
    expect(names).toContain('GreeeeeenAlert');
    expect(names).toContain('ManyakMerdo');
    expect(names).toContain('Zaid646');
    // 10 unique players across both lists.
    expect(names).toHaveLength(10);
  });

  it('returns nothing for plain reply threads', () => {
    const html = firstPost('Sign up by replying IN to this thread!');
    expect(parseRegistrationRoster(html)).toEqual([]);
  });
});

describe('parseRegistrations', () => {
  const post = (author: string, body: string) =>
    `<div class="comment_wrapper"><div class="comment_header"><span class="member_name"><a href="showuser=1">${author}</a></span></div><div class="comment">${body}</div></div>`;

  it('collects short affirmative replies by author', () => {
    const html = [
      post('Arcy', 'in'),
      post('Andrey', 'Andrey in too'),
      post('Mod', 'Read the rules please, registration closes Friday'),
    ].join('');
    expect(parseRegistrations(html)).toEqual(['Arcy', 'Andrey']);
  });

  it('accepts more sign-up phrasings', () => {
    const html = [
      post('Alex', 'count me in'),
      post('Boris', 'sign me up'),
      post('Carl', "I'm in!"),
      post('Drew', '+1'),
    ].join('');
    expect(parseRegistrations(html)).toEqual(['Alex', 'Boris', 'Carl', 'Drew']);
  });
});
