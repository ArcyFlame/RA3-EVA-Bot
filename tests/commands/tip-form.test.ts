import { describe, expect, it } from 'vitest';
import { CURATED_TIPS, TIP_FACTIONS, validateTip } from '../../src/content/tips';
import {
  buildTipForm,
  buildTipSourcesForm,
  formatTipDetails,
  parseTipDetails,
  parseTipFaction,
} from '../../src/commands/admin/tips-admin.form';

describe('two-step tip form', () => {
  it.each(['ra3', 'genevo'] as const)(
    'keeps %s basics separate from quote and source fields',
    (game) => {
      for (const tip of [undefined, CURATED_TIPS[game][0]]) {
        const form = buildTipForm('tipmgr:test', game, tip).toJSON();
        expect(form.components).toHaveLength(4);
        const fields = form.components.flatMap((row: any) => row.components);
        expect(fields.map((field: any) => field.custom_id)).toEqual([
          'title',
          'faction',
          'text',
          'footer',
        ]);
        expect(fields[1].label).toBe(
          game === 'ra3'
            ? 'General, Allies, Soviets or Empire'
            : 'Faction / subfaction (see admin menu list)',
        );
      }
    },
  );
  it.each(['ra3', 'genevo'] as const)('renders four individual %s quote/source fields', (game) => {
    const tip = CURATED_TIPS[game][0];
    const form = buildTipSourcesForm('tipmgr:test', tip).toJSON();
    const fields = form.components.flatMap((row: any) => row.components);
    expect(fields.map((field: any) => field.custom_id)).toEqual([
      'quote',
      'speaker',
      'quote_source',
      'tip_source',
    ]);
    expect(fields.map((field: any) => field.value)).toEqual([
      tip.quote?.text,
      tip.quote?.speaker,
      tip.quote?.source,
      tip.source,
    ]);
    expect(fields.every((field: any) => field.required === false)).toBe(true);
  });
  it('accepts the exact faction names requested for each game', () => {
    expect(Object.values(TIP_FACTIONS.ra3)).toEqual(['General', 'Allies', 'Soviets', 'Empire']);
    expect(Object.values(TIP_FACTIONS.genevo)).toEqual(
      expect.arrayContaining([
        'General',
        'USA',
        'China',
        'GLA',
        'USA | Air Force General',
        'USA | Laser General',
        'USA | Superweapon General',
        'China | Tank General',
        'China | Nuclear General',
        'China | Infantry General',
        'GLA | Toxin General',
        'GLA | Stealth General',
        'GLA | Demolition General',
      ]),
    );
    for (const game of ['ra3', 'genevo'] as const)
      for (const [id, label] of Object.entries(TIP_FACTIONS[game])) {
        expect(parseTipFaction(game, label)).toBe(id);
        expect(parseTipFaction(game, ` ${label.toLowerCase()} `)).toBe(id);
      }
    expect(parseTipFaction('genevo', 'China - Nuke')).toBe('china_nuke');
    expect(() => parseTipFaction('ra3', 'GLA')).toThrow();
    expect(() => parseTipFaction('genevo', '__proto__')).toThrow();
  });
  it.each(['ra3', 'genevo'] as const)(
    'round-trips existing %s quotes and sources unchanged',
    (game) => {
      for (const tip of CURATED_TIPS[game]) {
        const result = parseTipDetails(game, formatTipDetails(tip));
        expect(result).toEqual({ quote: tip.quote, source: tip.source });
        expect(() => validateTip({ ...tip, ...result })).not.toThrow();
      }
    },
  );
  it('allows blank or source-only details', () => {
    expect(parseTipDetails('ra3', formatTipDetails())).toEqual({ source: '', quote: undefined });
    expect(parseTipDetails('ra3', '')).toEqual({ source: '', quote: undefined });
    expect(parseTipDetails('ra3', 'Tip source: https://example.com/tip')).toEqual({
      source: 'https://example.com/tip',
      quote: undefined,
    });
  });
  it.each(['Quote: one\nQuote: two', 'Anything: text', 'unlabelled text'])(
    'rejects ambiguous details: %s',
    (value) => {
      expect(() => parseTipDetails('ra3', value)).toThrow();
    },
  );
});
