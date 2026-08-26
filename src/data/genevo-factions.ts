export const GENEVO_FACTIONS = [
  { name: 'USA', group: 'USA', color: '#2563EB' },
  { name: 'USA - Air Force General', group: 'USA', color: '#3B82F6' },
  { name: 'USA - Laser General', group: 'USA', color: '#38BDF8' },
  { name: 'USA - Superweapon General', group: 'USA', color: '#93C5FD' },
  { name: 'China', group: 'China', color: '#B91C1C' },
  { name: 'China - Nuke General', group: 'China', color: '#EF4444' },
  { name: 'China - Tank General', group: 'China', color: '#DC2626' },
  { name: 'China - Infantry General', group: 'China', color: '#F87171' },
  { name: 'GLA', group: 'GLA', color: '#166534' },
  { name: 'GLA - Toxin Weapons General', group: 'GLA', color: '#22C55E' },
  { name: 'GLA - Demolition General', group: 'GLA', color: '#15803D' },
  { name: 'GLA - Stealth General', group: 'GLA', color: '#4ADE80' },
] as const;

export type GenevoFactionName = (typeof GENEVO_FACTIONS)[number]['name'];
export type GenevoFactionGroup = (typeof GENEVO_FACTIONS)[number]['group'];
export type GenevoFactionDistribution = Record<GenevoFactionName, number | null>;

/** Null means the source does not report this faction; zero is a real reported count. */
export function emptyGenevoFactionDistribution(): GenevoFactionDistribution {
  return Object.fromEntries(
    GENEVO_FACTIONS.map(({ name }) => [name, null]),
  ) as unknown as GenevoFactionDistribution;
}

export function genevoFactionTotal(distribution: GenevoFactionDistribution): number {
  return Object.values(distribution).reduce<number>(
    (total, value) => total + (typeof value === 'number' ? value : 0),
    0,
  );
}
