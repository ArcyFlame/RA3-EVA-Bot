/** One identity key for imports, registrations and staff lookups. */
export function tournamentPlayerKey(name: string): string | undefined {
  const clean = name.normalize('NFKC').trim();
  if (!clean || clean.length > 50 || /[\p{Cc}\p{Cf}]/u.test(clean)) return undefined;
  return clean.toLowerCase();
}
