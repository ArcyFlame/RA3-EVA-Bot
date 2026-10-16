import { RA3Stats, StatsSourceOptions } from '../services/ra3-stats.service';

/** Combine reported pick counts, not percentages; the two platforms sample different matches. */
export function ra3FactionCharts(stats: RA3Stats, sources: StatsSourceOptions, separate = false) {
  const entries = [
    ...(sources.cncOnline !== false && stats.cnc_faction_distribution
      ? [
          {
            data: stats.cnc_faction_distribution,
            label: 'Shatabrick - Monthly Picks',
            name: 'shatabrick_faction_distribution.png',
          },
        ]
      : []),
    ...(sources.ra3BattleNet !== false
      ? [
          {
            data: stats.faction_distribution,
            label: 'RA3BattleNet - Ranked 1v1 Picks',
            name: 'ra3battlenet_faction_distribution.png',
          },
        ]
      : []),
  ].filter((entry) => Object.values(entry.data).some((value) => value > 0));
  if (separate || entries.length <= 1) return entries;
  return [
    {
      data: entries.reduce(
        (total, { data }) => ({
          Allies: total.Allies + data.Allies,
          Soviets: total.Soviets + data.Soviets,
          Empire: total.Empire + data.Empire,
        }),
        { Allies: 0, Soviets: 0, Empire: 0 },
      ),
      label: 'Combined Reported Faction Picks',
      name: 'combined_faction_distribution.png',
    },
  ];
}
