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
  it('renders a quote with no attribution or source without empty buttons or lines', () => {
    const tip = {
      ...CURATED_TIPS.ra3[0],
      origin: 'server' as const,
      source: '',
      quote: { ...CURATED_TIPS.ra3[0].quote!, text: 'A quote', speaker: '', source: '' },
    };
    expect(() => validateTip(tip)).not.toThrow();
    const card = tipCard(tip);
    expect(card.embeds[0].data.description).toContain('> A quote');
    expect(card.embeds[0].data.description).not.toContain('\n- ');
    expect(card.components).toEqual([]);
    expect(() => validateTip({ ...tip, origin: 'curated' })).toThrow();
  });
  it('does not render an empty quote when only optional metadata is supplied', () => {
    const tip = {
      ...CURATED_TIPS.ra3[0],
      origin: 'server' as const,
      source: '',
      quote: {
        ...CURATED_TIPS.ra3[0].quote!,
        text: '',
        speaker: 'Unit',
        source: 'https://example.com/quote',
      },
    };
    expect(() => validateTip(tip)).not.toThrow();
    const card = tipCard(tip);
    expect(card.embeds[0].data.description).not.toContain('\n>');
    expect(card.components[0].components[0].toJSON().label).toBe('Quote Source');
  });
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
      { footer: 'x'.repeat(201) },
      { footer: 'Bad—footer' },
      { footer: 'two\nlines' },
      { footer: '' },
      { quote: { ...CURATED_TIPS.ra3[0].quote!, game: 'Generals / Zero Hour' as const } },
    ])
      expect(() => validateTip({ ...CURATED_TIPS.ra3[0], ...change })).toThrow();
  });
  it('renders an optional custom footer while keeping safe mention settings', () => {
    const tip = { ...CURATED_TIPS.ra3[0], footer: 'Allied field guide - @everyone' };
    expect(validateTip(tip)).toBe(tip);
    const card = tipCard(tip);
    expect(card.embeds[0].data.footer?.text).toBe(tip.footer);
    expect(card.allowedMentions.parse).toEqual([]);
  });
  it('omits the source button and empty rows when a staff tip has no source', () => {
    const tip = { ...CURATED_TIPS.ra3[0], origin: 'server' as const, source: '', quote: undefined };
    expect(validateTip(tip)).toBe(tip);
    expect(tipCard(tip).components).toEqual([]);
    const withQuote = tipCard({ ...tip, quote: CURATED_TIPS.ra3[0].quote });
    expect(withQuote.components[0].toJSON().components).toHaveLength(1);
    expect(withQuote.components[0].components[0].toJSON().label).toBe('Quote Source');
    expect(() => validateTip({ ...tip, origin: 'curated' })).toThrow();
  });
});
