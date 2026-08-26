import { describe, expect, it } from 'vitest';
import { getBarChartTheme } from '../../src/utils/charts';

describe('bar chart themes', () => {
  it('uses the Miedinger military theme for Generals Evolution', () => {
    const theme = getBarChartTheme('genevo', 'Reds_r');
    expect(theme.fontFamily).toContain('Miedinger Medium W00 Regular');
    expect(theme.titleColor).toBe('#A7C957');
    expect(theme.deepColor).toBe('#31572C');
  });

  it('keeps the classic Red Alert theme for RA3', () => {
    const theme = getBarChartTheme('ra3', 'Reds_r');
    expect(theme.fontFamily).toContain('Red Alert');
    expect(theme.titleColor).toBe('#FF0F0F');
    expect(theme.deepColor).toBe('#8B1A1A');
  });
});
