/**
 * Strict integer parsing for untrusted values (customId fragments, select-menu
 * values, text inputs). Returns null on anything malformed instead of NaN —
 * callers must handle null explicitly, so a crafted customId can never reach a
 * repository with NaN.
 */
export function parseIntSafe(value: string | undefined | null): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Parses a `_`-delimited customId fragment (e.g. `clan_kick_42` → index 2 → 42). */
export function parseCustomIdInt(customId: string, index: number): number | null {
  return parseIntSafe(customId.split('_')[index]);
}
