import { escapeMarkdown } from 'discord.js';

export interface MatchPlayer {
  name: string;
  team?: string;
  isAI?: boolean;
  observer?: boolean;
  faction?: string;
}
export interface MatchSummary {
  players: string;
  map: string;
  platform: string;
  participants?: MatchPlayer[];
  mode?: string;
  teams?: string[][];
  startedAt?: number;
  matchId?: string;
}
function flag(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}
export function isHumanLobbyPlayer(player: any): boolean {
  return (
    !!player &&
    typeof player === 'object' &&
    !flag(player.isAI ?? player.isAi ?? player.ai) &&
    !flag(player.observer ?? player.isObserver) &&
    !/^(ai|computer|observer|spectator)$/i.test(player.type ?? '')
  );
}
export function summarizeMatch(game: any, platform: string, map: string): MatchSummary {
  const raw = Array.isArray(game.players)
    ? game.players
    : game.players && typeof game.players === 'object'
      ? Object.values(game.players)
      : [];
  const participants: MatchPlayer[] = raw
    .slice(0, 16)
    .filter((p: any) => p && typeof p === 'object')
    .map((p: any) => ({
      name: String(
        p.nickname ??
          p.name ??
          p.personaName ??
          (flag(p.isAI ?? p.isAi ?? p.ai) ? 'AI' : 'Unknown'),
      ).slice(0, 80),
      team: p.team ?? p.teamId ?? p.teamIndex,
      isAI: flag(p.isAI ?? p.isAi ?? p.ai) || /^(ai|computer)$/i.test(p.type ?? ''),
      observer: flag(p.observer ?? p.isObserver) || /^(observer|spectator)$/i.test(p.type ?? ''),
      faction: typeof p.faction === 'string' ? p.faction : undefined,
    }))
    .filter((p: MatchPlayer) => !p.observer);
  const result: MatchSummary = {
    players: participants.map((p) => p.name).join(', '),
    participants,
    map,
    platform,
  };
  const explicit = String(game.matchType ?? game.type ?? game.mode ?? game.gamemode ?? '')
    .replace(/^valid/i, '')
    .toLowerCase()
    .replace(/vs/g, 'v');
  if (/^(ffa|free[- ]?for[- ]?all)$/.test(explicit)) result.mode = 'FFA';
  else if (
    participants.length >= 2 &&
    participants.every((p) => p.team != null && String(p.team) !== '-1')
  ) {
    const teams = new Map<string, string[]>();
    for (const p of participants) {
      const key = String(p.team);
      teams.set(key, [...(teams.get(key) ?? []), p.name]);
    }
    if (teams.size === participants.length && teams.size > 2) result.mode = 'FFA';
    else if (teams.size >= 2) {
      result.teams = [...teams.values()];
      result.mode = result.teams.map((t) => t.length).join('v');
    }
  } else if (/^\dv\d(?:v\d)*$/.test(explicit)) result.mode = explicit;
  return result;
}
export function formatMatchPlayers(match: MatchSummary): string {
  const participants: MatchPlayer[] =
    match.participants ??
    match.players
      .split(',')
      .filter(Boolean)
      .map((name) => ({ name: name.trim() }));
  const label = (name: string) =>
    `**${escapeMarkdown(name)}**` +
    (participants.some((p) => p.name === name && p.isAI) ? ' (AI)' : '');
  if (match.mode === 'FFA')
    return `(FFA) ${participants.map((p) => label(p.name)).join(', ')}`.slice(0, 750);
  if (match.teams?.length)
    return (
      `(${match.mode ?? match.teams.map((t) => t.length).join('v')}) ` +
      match.teams
        .map((t) => t.map(label).join(' + '))
        .join(' vs ')
        .slice(0, 700)
    );
  const prefix = match.mode ? `(${match.mode})` : `(${participants.length} players)`;
  return `${prefix} ${participants.map((p) => label(p.name)).join(', ')}`.slice(0, 750);
}
