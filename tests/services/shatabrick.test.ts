import { describe, expect, it } from 'vitest';
import {
  extractShatabrickProfileId,
  parseShatabrickProfileHtml,
} from '../../src/services/shatabrick.service';

describe('parseShatabrickProfileHtml', () => {
  it('reads rank artwork, all statistics categories and current ladder ELO', () => {
    const html = `
      <html><head><title>Player statistics for Example</title></head><body>
        <table>
          <tr><td>Nickname:</td><td>Example</td></tr>
          <tr><td>Level:</td><td>12</td></tr>
          <tr><td>Score:</td><td>4,321</td></tr>
        </table>
        <img src="/cco/ra3/images/IconsLarge/BLK12.png" alt="Black Belt 12" />
        <table>
          <tr><th></th><th>Unranked</th><th>Ranked 1v1</th><th>Ranked 2v2</th><th>Clan 1v1</th><th>Clan 2v2</th></tr>
          <tr><td>Games</td><td>20</td><td>10</td><td>8</td><td>4</td><td>2</td></tr>
          <tr><td>Wins</td><td>12</td><td>7</td><td>5</td><td>3</td><td>1</td></tr>
          <tr><td>Losses</td><td>8</td><td>3</td><td>3</td><td>1</td><td>1</td></tr>
        </table>
        <table>
          <tr><th>Mode</th><th>Rank</th><th>Elo</th><th>Wins</th><th>Losses</th></tr>
          <tr><td>Ranked 1vs1</td><td>15</td><td>1642</td><td>7</td><td>3</td></tr>
          <tr><td>Ranked 2vs2</td><td>8</td><td>1710</td><td>5</td><td>3</td></tr>
        </table>
      </body></html>`;

    const profile = parseShatabrickProfileHtml(html, 10243);
    expect(profile?.nickname).toBe('Example');
    expect(profile?.rankImageUrl).toContain('/IconsLarge/BLK12.png');
    expect(profile?.score).toBe(4321);
    expect(profile?.modes['Unranked']).toMatchObject({ games: 20, wins: 12, losses: 8 });
    expect(profile?.modes['Ranked 1v1']).toMatchObject({
      games: 10,
      wins: 7,
      losses: 3,
      elo: 1642,
      rank: 15,
    });
  });

  it('handles the current profile markup and infers wins from games minus losses', () => {
    const html = `<body>
      Profile (click to go to persona):
      <h1><a title="Go to persona page">SW_Unrealdeath</a></h1>
      <img src="images/IconsLarge/BLK12.png">
      <h3>Games Allies: 0 Level: 12 Score: 175 Next Level: 202</h3>
      <table>
        <tr><th></th><th>Unranked</th><th>Ranked 1v1</th><th>Ranked 2v2</th><th>Clan 1v1</th><th>Clan 2v2</th></tr>
        <tr><td>GAMES</td><td>181</td><td>0</td><td>0</td><td>0</td><td>0</td></tr>
        <tr><td>LOSSES</td><td>156</td><td>0</td><td>0</td><td>0</td><td>0</td></tr>
      </table>
    </body>`;
    const profile = parseShatabrickProfileHtml(html, 10243);
    expect(profile?.nickname).toBe('SW_Unrealdeath');
    expect(profile?.level).toBe(12);
    expect(profile?.score).toBe(175);
    expect(profile?.rankLabel).toBe('Level 12');
    expect(profile?.modes.Unranked).toMatchObject({ games: 181, wins: 25, losses: 156 });
  });

  it('chooses the exact nickname instead of the first profile under a commander', () => {
    const html = `<body>
      <a href="index.php?g=ra&a=pp&id=1580">0000</a>
      <a href="index.php?g=ra&a=pp&id=1563">DutchArmy</a>
      <span title="Profile 1586">DutchArmy123</span>
    </body>`;
    expect(extractShatabrickProfileId(html, 'DutchArmy')).toBe(1563);
    expect(extractShatabrickProfileId(html, 'DutchArmy123')).toBe(1586);
  });
});
