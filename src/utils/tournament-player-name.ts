/** One identity key for imports, registrations and staff lookups. */
export function tournamentPlayerKey(name: string): string | undefined {
  const clean = name.normalize('NFKC').trim();
  if (!clean || clean.length > 50 || /[\p{Cc}\p{Cf}]/u.test(clean)) return undefined;
  return clean.toLowerCase();
}

/** Reject recognizable article metadata from unverified forum imports, not player identities. */
export function isForumPlayerName(name: string): boolean {
  return !!tournamentPlayerKey(name) && !isForumRegistrationMetadata(name);
}

export function isForumRegistrationMetadata(name: string): boolean {
  return (
    /^tweet\s*$/i.test(name) ||
    /^(?:this\s+)?post\s+(?:has\s+been\s+)?edited\b/i.test(name) ||
    /^(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\s*(?:[ap]m)?$/i.test(name) ||
    /https?:\/\/|\bdiscord\b.*\b(?:events?|server|invite)\b/i.test(name) ||
    /\b(?:announcement|registration closes|registration closed)\b/i.test(name) ||
    /^(?:prizes?|prize pool|format|details|fair play|streaming|registered|registration|sign up|gl\s*hf)\s*[:!*]*$/i.test(
      name,
    ) ||
    /^(?:\d+(?:st|nd|rd|th)|first|second|third)\s*(?:&\s*\d+(?:st|nd|rd|th)\s*)?place\b/i.test(
      name,
    ) ||
    /\d\s*[$€£]|[$€£]\s*\d/.test(name)
  );
}
