import { describe, expect, it } from 'vitest';
import { CURATED_TIPS, TIP_FACTIONS, validateTip, validateSource } from '../../src/content/tips';
import { tipCard } from '../../src/commands/info/tips.view';
import {
  GENEVO_LOGO,
  RA3_LOGO,
  FACTION_USA,
  FACTION_CHINA,
  FACTION_GLA,
} from '../../src/utils/emojis';

describe('sourced tips', () => {
  for (const game of ['ra3', 'genevo'] as const) {
    it(`${game} has stable IDs and a speaker/source for every built-in quote`, () => {
      const tips = CURATED_TIPS[game];
      expect(tips.length).toBeGreaterThanOrEqual(8);
      expect(new Set(tips.map((t) => t.id)).size).toBe(tips.length);
      for (const tip of tips) {
        expect(validateTip(tip)).toBe(tip);
        expect(tip.quote?.game).toBe(game === 'ra3' ? 'Red Alert 3' : 'Generals / Zero Hour');
        expect(tip.quote?.speaker).not.toMatch(/E\.V\.A\.|Command$/);
        const view = tipCard(tip);
        expect(view.embeds[0].data.description).toContain(
          `${game === 'ra3' ? RA3_LOGO : GENEVO_LOGO} Tip #${tip.id}\n\n`,
        );
        expect(view.components[0].components.map((c) => c.toJSON().style)).toEqual([5, 5]);
        expect(view.embeds[0].data.description?.length).toBeLessThan(4096);
        expect(JSON.stringify(view)).not.toContain('—');
      }
    });
  }
  it('supports every GenEvo general with the correct base faction logo', () => {
    expect(Object.keys(TIP_FACTIONS.genevo)).toHaveLength(13);
    for (const faction of Object.keys(TIP_FACTIONS.genevo).filter((f) => f !== 'general')) {
      const view = tipCard({ ...CURATED_TIPS.genevo[0], faction });
      expect(view.embeds[0].data.description).toContain(
        faction.startsWith('usa')
          ? FACTION_USA
          : faction.startsWith('china')
            ? FACTION_CHINA
            : FACTION_GLA,
      );
    }
  });
  it('does not silently add a quote to a staff tip', () => {
    const view = tipCard({ ...CURATED_TIPS.ra3[0], origin: 'server', quote: undefined });
    expect(view.embeds[0].data.footer?.text).toContain('supplied by staff');
    expect(view.components[0].components).toHaveLength(1);
    expect(view.embeds[0].data.description).not.toContain('field tests');
  });
  it.each([
    'http://example.com',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'https://user:pass@example.com',
    'https://127.0.0.1',
    'https://localhost',
    'https://test.local',
    'https://[::1]',
  ])('rejects unsafe source %s', (source) => expect(() => validateSource(source)).toThrow());
  it('rejects oversize fields, wrong game quotes and invalid factions', () => {
    for (const change of [
      { text: 'x'.repeat(1201) },
      { faction: '__proto__' },
      { title: 'Bad—title' },
      { quote: { ...CURATED_TIPS.ra3[0].quote!, game: 'Generals / Zero Hour' as const } },
    ])
      expect(() => validateTip({ ...CURATED_TIPS.ra3[0], ...change })).toThrow();
  });
});
