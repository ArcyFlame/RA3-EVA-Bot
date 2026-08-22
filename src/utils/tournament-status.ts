export type TournamentStatus =
  | 'unknown'
  | 'registration'
  | 'checkin'
  | 'in_progress'
  | 'ended';

export const ESPORTS_FALLBACK_URL =
  'https://www.gamereplays.org/redalert3/portals.php?show=esports';

export function parsePortalDate(text: string): number | null {
  const match = text.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
  if (!match) return null;
  const months: Record<string, number> = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11,
  };
  const month = months[match[2]];
  if (month === undefined) return null;
  return new Date(Number(match[3]), month, Number(match[1])).getTime();
}

export function statusFromChallonge(value: unknown): TournamentStatus {
  const state = String(value ?? '').toLowerCase();
  if (state === 'complete' || state === 'awaiting_review') return 'ended';
  if (state === 'underway' || state === 'in_progress') return 'in_progress';
  if (state === 'pending') return 'registration';
  return 'unknown';
}

export function resolveTournamentStatus(input: {
  storedStatus?: string | null;
  startDate?: string | null;
  registrationUrl?: string | null;
  checkinsUrl?: string | null;
}): TournamentStatus {
  if (
    input.storedStatus === 'ended' ||
    input.storedStatus === 'in_progress' ||
    input.storedStatus === 'checkin' ||
    input.storedStatus === 'registration'
  ) {
    return input.storedStatus;
  }
  const start = parsePortalDate(input.startDate ?? '');
  if (start !== null && start + 26 * 60 * 60 * 1000 < Date.now()) return 'ended';
  if (input.checkinsUrl) return 'checkin';
  if (input.registrationUrl) return 'registration';
  return 'unknown';
}

export function tournamentStatusLabel(status: TournamentStatus): string {
  switch (status) {
    case 'registration':
      return '🟢 Registration open';
    case 'checkin':
      return '🟡 Check-in open';
    case 'in_progress':
      return '🟠 In progress';
    case 'ended':
      return '🔴 Ended';
    default:
      return '⚪ Status not confirmed';
  }
}
