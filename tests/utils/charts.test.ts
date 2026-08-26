import { describe, expect, it } from 'vitest';
import { generateGenevoFactionChartBuffer, getBarChartTheme } from '../../src/utils/charts';
import { emptyGenevoFactionDistribution, GENEVO_FACTIONS } from '../../src/data/genevo-factions';

describe('bar chart themes', () => {
  it('uses the Miedinger military theme for Generals Evolution', () => {
    const theme = getBarChartTheme('genevo', 'Reds_r');
    expect(theme.fontFamily).toContain('Miedinger Book');
    expect(theme.titleColor).toBe('#A7C957');
    expect(theme.deepColor).toBe('#31572C');
  });

  it('keeps the classic Red Alert theme for RA3', () => {
    const theme = getBarChartTheme('ra3', 'Reds_r');
    expect(theme.fontFamily).toContain('Red Alert');
    expect(theme.titleColor).toBe('#FF0F0F');
    expect(theme.deepColor).toBe('#8B1A1A');
  });

  it('uses a distinct blue chart for new Generals Evolution players', () => {
    const theme = getBarChartTheme('genevo', 'Blues_r');
    expect(theme.titleColor).toBe('#60A5FA');
    expect(theme.deepColor).toBe('#1D4ED8');
  });

  it('renders the API-ready Generals Evolution faction chart', async () => {
    expect(GENEVO_FACTIONS).toHaveLength(12);
    expect(GENEVO_FACTIONS.filter((faction) => faction.group === 'USA')).toHaveLength(4);
    expect(GENEVO_FACTIONS.filter((faction) => faction.group === 'China')).toHaveLength(4);
    expect(GENEVO_FACTIONS.filter((faction) => faction.group === 'GLA')).toHaveLength(4);
    const data = emptyGenevoFactionDistribution();
    const chart = await generateGenevoFactionChartBuffer(data);
    expect(chart.subarray(1, 4).toString()).toBe('PNG');
    expect(chart.length).toBeGreaterThan(10_000);
  });
});
