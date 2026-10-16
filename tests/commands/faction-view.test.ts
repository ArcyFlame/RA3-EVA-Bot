import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectDatabase } from '../../src/database/connection';
import { guildRepository } from '../../src/repositories/guild.repository';
import { StatsView } from '../../src/commands/stats/stats.view';
import { execute as navigate } from '../../src/interactions/buttons/stats-nav.button';
import { ra3StatsService, RA3Stats } from '../../src/services/ra3-stats.service';
import { generatePieChartBuffer } from '../../src/utils/charts';
import { emptyGenevoFactionDistribution } from '../../src/data/genevo-factions';
import { appSettingsRepository } from '../../src/repositories/app-settings.repository';
import { ra3FactionCharts } from '../../src/utils/faction-chart-data';
import { setFeatureState } from '../../src/commands/setup/feature-toggle.view';

vi.mock('../../src/utils/charts', () => ({
  generatePieChartBuffer: vi.fn().mockResolvedValue(Buffer.from('chart')),
  generateGenevoFactionChartBuffer: vi.fn().mockResolvedValue(Buffer.from('chart')),
}));
beforeAll(connectDatabase);
beforeEach(() => {
  vi.clearAllMocks();
});
const stats = () =>
  ({
    cnc_recent_matches: [
      { players: 'Solo', participants: [{ name: 'Solo' }], map: 'Test', platform: 'C&C Online' },
    ],
    ra3battle_recent_matches: [],
    top_maps: [],
    cnc_faction_distribution: { Allies: 50, Soviets: 30, Empire: 20 },
    faction_distribution: { Allies: 5, Soviets: 5, Empire: 90 },
    genevo_faction_distribution: emptyGenevoFactionDistribution(),
    genevo_faction_source: 'unavailable',
  }) as unknown as RA3Stats;
describe('source-specific faction page', () => {
  it('defaults to one chart, sums counts and isolates the split preference per server', () => {
    expect(appSettingsRepository.hasSeparateFactionCharts('one')).toBe(false);
    expect(ra3FactionCharts(stats(), {})).toEqual([
      {
        data: { Allies: 55, Soviets: 35, Empire: 110 },
        label: 'Combined Reported Faction Picks',
        name: 'combined_faction_distribution.png',
      },
    ]);
    setFeatureState('one', 'separateFactionCharts', true);
    expect(appSettingsRepository.hasSeparateFactionCharts('one')).toBe(true);
    expect(appSettingsRepository.hasSeparateFactionCharts('two')).toBe(false);
    expect(ra3FactionCharts(stats(), {}, true)).toHaveLength(2);
    expect(ra3FactionCharts(stats(), { cncOnline: false, ra3BattleNet: false })).toEqual([]);
    expect(ra3FactionCharts({ ...stats(), cnc_faction_distribution: undefined }, {})).toHaveLength(
      1,
    );
    setFeatureState('one', 'separateFactionCharts', false);
    expect(appSettingsRepository.hasSeparateFactionCharts('one')).toBe(false);
  });
  it('does not show raw refresh timestamps in stats', () => {
    const view = new StatsView(stats());
    view.setPage(1);
    expect(JSON.stringify(view.getEmbed().toJSON())).not.toContain('Last refresh');
    expect(view.getEmbed().toJSON().timestamp).toBeUndefined();
  });
  it('keeps Shatabrick monthly and RA3BattleNet ranked samples separate', () => {
    const view = new StatsView(stats());
    view.setPage(1);
    const fields = view.getEmbed().toJSON().fields!;
    const shata = fields.find((f) => f.name.includes('Shatabrick'))!;
    const ra3b = fields.find((f) => f.name.includes('Popularity (RA3BattleNet)'))!;
    expect(shata.value).toContain('50%');
    expect(shata.value).toContain('Monthly');
    expect(ra3b.value).toContain('90%');
    expect(ra3b.value).toContain('Ranked 1v1');
    expect(fields[0].value).toBe('**Solo** · *Test*');
    expect(fields[0].value).not.toMatch(/\(\d+ players?\)/);
  });
  it('does not show RA3 faction snapshots inside GenEvo', () => {
    const view = new StatsView(stats(), 'genevo');
    view.setPage(1);
    const fields = view.getEmbed().toJSON().fields!;
    expect(fields.some((f) => f.name.includes('Shatabrick'))).toBe(false);
    expect(fields.find((f) => f.name.includes('Sub-faction'))?.value).toBe(
      'No faction data available.',
    );
  });
  it.each([
    [true, false],
    [false, false],
    [true, true],
    [false, true],
  ])('renders enabled sources (C&C Online: %s, split: %s)', async (useCnc, separate) => {
    const id = `faction-nav-${useCnc}-${separate}`;
    appSettingsRepository.setSeparateFactionCharts(id, separate);
    guildRepository.upsert(id, {
      game: 'ra3',
      cncOnlineEnabled: useCnc ? 1 : 0,
      ra3BattleNetEnabled: 1,
    });
    vi.spyOn(ra3StatsService, 'fetch').mockResolvedValue(stats());
    const interaction: any = {
      guildId: id,
      message: { id },
      customId: 'stats_nav_next_0_0',
      deferUpdate: vi.fn(),
      editReply: vi.fn(),
      followUp: vi.fn(),
    };
    await navigate(null as never, interaction);
    expect(generatePieChartBuffer).toHaveBeenCalledTimes(useCnc && separate ? 2 : 1);
    expect(interaction.followUp).toHaveBeenCalledTimes(useCnc && separate ? 2 : 1);
    for (const [payload] of interaction.followUp.mock.calls) {
      expect(payload.files).toHaveLength(1);
      expect(payload.ephemeral).toBe(true);
    }
  });
});
