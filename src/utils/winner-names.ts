/** Converts a Challonge participant label into the player names credited with a win. */
export function normalizeTournamentWinnerNames(value: string, teamEvent = false): string[] {
  const stripStatus = (name: string) =>
    name
      // Old replay tables mark the winner with a leading asterisk. It is not
      // part of the player's nickname and must not create a second identity.
      .replace(/^\*+\s*/u, '')
      .replace(/\s+(?:d\/?q|disqualified)$/i, '')
      .replace(/\s+\([^()]{2,40}\)$/u, '')
      .replace(/\s+/g, ' ')
      .trim();
  const initial = stripStatus(value).slice(0, 160);
  if (!initial) return [];

  const team = initial.match(/^team\s*\d*\s+(.+)$/i);
  const names = team || teamEvent
    ? (team?.[1] ?? initial).split(/\s+(?:and|&|\+)\s+|\s*\/\s*/i)
    : [initial];
  return [
    ...new Map(
      names
        .map(stripStatus)
        .filter((name) => name.length >= 2)
        .map((name) => [name.toLocaleLowerCase('en-US'), name.slice(0, 80)]),
    ).values(),
  ];
}
