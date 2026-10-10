export const CREDENTIAL_KEYS = [
  'CHALLONGE_API_KEY',
  'CHALLONGE_SUBDOMAIN',
  'TWITCH_CLIENT_ID',
  'TWITCH_CLIENT_SECRET',
  'TWITCH_REFRESH_TOKEN',
  'YOUTUBE_API_KEY',
  'YOUTUBE_VERIFY_TOKEN',
  'YOUTUBE_CALLBACK_SECRET',
  'STEAM_API_KEY',
] as const;
export type CredentialKey = (typeof CREDENTIAL_KEYS)[number];
const overrides = new Map<CredentialKey, string | null>();
const secretHistory = new Set<string>();
export function configuredCredential(key: CredentialKey): string | undefined {
  return (overrides.has(key) ? overrides.get(key) : process.env[key])?.trim() || undefined;
}
export function replaceCredentialOverrides(
  values: Partial<Record<CredentialKey, string | null>>,
): void {
  overrides.clear();
  for (const key of CREDENTIAL_KEYS)
    if (key in values) {
      overrides.set(key, values[key] ?? null);
      if (values[key]) secretHistory.add(values[key]!);
    }
}
export function credentialSecrets(): string[] {
  return [...secretHistory];
}
