import { beforeAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { connectDatabase } from '../../src/database/connection';
import { db } from '../../src/database/sqlite';
import { activityRankRepository as activity } from '../../src/repositories/activity-rank.repository';
import { guildRepository } from '../../src/repositories/guild.repository';
import { masterRepository } from '../../src/repositories/master.repository';
import { getGameContext } from '../../src/utils/game-context';
import { qualifyingChatHash } from '../../src/services/activity-rank.service';
import { summarizeMatch, formatMatchPlayers } from '../../src/utils/match-format';
import { MapCatalogService } from '../../src/services/map-catalog.service';
import {
  ObservedMatchService,
  parseObservedMatch,
} from '../../src/services/observed-match.service';
import { normalizeGenevoFaction } from '../../src/data/genevo-factions';
import { sourceGet } from '../../src/utils/safe-fetch';

vi.mock('../../src/utils/safe-fetch', () => ({ sourceGet: vi.fn(), safeGetText: vi.fn() }));
beforeAll(async () => {
  await connectDatabase();
});
beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('persistent optional chat XP', () => {
  function award(guildId: string, content: string) {
    return activity.recordActivity({
      guildId,
      userId: 'member',
      activityDate: new Date().toISOString().slice(0, 10),
      hasCncPing: false,
      replayFingerprints: [],
      chatContentHash: qualifyingChatHash(content),
      occurredAt: Date.now(),
    }).pointsAwarded;
  }
  it('is off by default and rejects non-chat input', () => {
    expect(activity.getSettings('chat-default').chatEnabled).toBe(false);
    expect(award('chat-default', 'This is a proper conversation message')).toBe(0);
    for (const s of [
      'hi',
      '/help long command with arguments',
      '<@1234> https://example.com',
      '!!!!!!!!!!!!!!!!!!!!',
    ])
      expect(qualifyingChatHash(s)).toBeUndefined();
  });
  it('enforces cooldown, duplicate text, daily XP cap and reset/restart protection', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T10:00:00Z'));
    activity.updateSettings(
      'chat-limits',
      { chatEnabled: true, chatPoints: 5, chatCooldownSeconds: 60, chatDailyCap: 12 },
      0,
    );
    expect(award('chat-limits', 'This is our first proper conversation')).toBe(5);
    expect(award('chat-limits', 'This is a different proper conversation')).toBe(0);
    vi.setSystemTime(Date.now() + 61000);
    expect(award('chat-limits', 'THIS IS OUR FIRST PROPER CONVERSATION')).toBe(0);
    expect(award('chat-limits', 'This is a different proper conversation')).toBe(5);
    vi.setSystemTime(Date.now() + 61000);
    expect(award('chat-limits', 'Third conversation message for this test')).toBe(2);
    activity.resetMember('chat-limits', 'member');
    vi.setSystemTime(Date.now() + 61000);
    expect(award('chat-limits', 'Fourth conversation message for this test')).toBe(0);
  });
  it('rejects stale timestamps and bounds admin configuration', () => {
    activity.updateSettings('chat-validation', { chatEnabled: true }, 0);
    expect(
      activity.recordActivity({
        guildId: 'chat-validation',
        userId: 'member',
        activityDate: new Date().toISOString().slice(0, 10),
        hasCncPing: false,
        replayFingerprints: [],
        chatContentHash: 'a'.repeat(64),
        occurredAt: Date.now() - 600000,
      }).pointsAwarded,
    ).toBe(0);
    expect(() => activity.updateSettings('chat-validation', { chatCooldownSeconds: 0 }, 1)).toThrow(
      'cooldown',
    );
    expect(() => activity.updateSettings('chat-validation', { chatDailyCap: 10001 }, 1)).toThrow(
      'Daily chat',
    );
  });
});
describe('game-specific feature defaults and masters', () => {
  it('defaults GenEvo masters off, retains explicit settings and isolates identical names', () => {
    guildRepository.upsert('masters-gen', { game: 'genevo' });
    guildRepository.upsert('masters-ra3', { game: 'ra3' });
    expect(getGameContext('masters-gen').mastersEnabled).toBe(false);
    expect(getGameContext('masters-ra3').mastersEnabled).toBe(true);
    guildRepository.toggleFeature('masters-gen', 'masters', true);
    guildRepository.upsert('masters-gen', { game: 'genevo' });
    expect(getGameContext('masters-gen').mastersEnabled).toBe(true);
    masterRepository.create('Shared test name', 2026, '1.12', 'ra3');
    masterRepository.create('Shared test name', 2026, '0.33', 'genevo');
    expect(masterRepository.findByName('Shared test name', 'genevo')?.patch).toBe('0.33');
    masterRepository.deleteByName('Shared test name', 'genevo');
    expect(masterRepository.findByName('Shared test name', 'ra3')?.patch).toBe('1.12');
  });
  it('keeps charts enabled by default and supports an independent off switch', () => {
    guildRepository.upsert('chart-controls', { game: 'genevo' });
    expect(getGameContext('chart-controls').chartsEnabled).toBe(true);
    guildRepository.toggleFeature('chart-controls', 'charts', false);
    expect(getGameContext('chart-controls').chartsEnabled).toBe(false);
    expect(getGameContext('chart-controls').sources.ra3BattleNet).toBe(true);
  });
});
describe('match mode evidence', () => {
  it.each(['1v1', '2v2', '3v3', '4v4', '2v2v2', '2v2v2v2', '3v2', '1v2'])(
    'groups reported teams for %s',
    (mode) => {
      const sizes = mode.split('v').map(Number);
      const players = sizes.flatMap((n, team) =>
        Array.from({ length: n }, (_, i) => ({ name: `Player ${team}-${i}`, team })),
      );
      const m = summarizeMatch({ players }, 'RA3BattleNet', 'Test Map');
      expect(m.mode).toBe(mode);
      expect(formatMatchPlayers(m)).toContain(' vs ');
    },
  );
  it('labels FFA compactly, marks AI, removes observers and never guesses teams from slots', () => {
    const m = summarizeMatch(
      {
        mode: 'FFA',
        players: [
          { name: 'A' },
          { name: 'B', isAI: true },
          { name: 'C' },
          { name: 'Spectator', isObserver: true },
        ],
      },
      'C&C Online',
      'Test',
    );
    expect(formatMatchPlayers(m)).toContain('(FFA)');
    expect(formatMatchPlayers(m)).toContain('(AI)');
    expect(formatMatchPlayers(m)).not.toContain(' vs ');
    expect(m.players).not.toContain('Spectator');
    const unknown = summarizeMatch(
      { numRealPlayers: 6, players: [{ name: 'A' }, { name: 'B' }] },
      'C&C Online',
      'Test',
    );
    expect(unknown.mode).toBeUndefined();
    expect(formatMatchPlayers(unknown)).toContain('(2 players)');
  });
});
describe('observed map catalog and match records', () => {
  const rawMatch = () => ({
    id: 'verified-match-test',
    modFamilyName: 'genevo',
    startTime: new Date().toISOString(),
    map: 'data/maps/genevo033_sgor00_skrm_14/genevo033_sgor00_skrm_14.map',
    type: 'Valid2v2',
    winners: [
      { personaName: 'A', faction: 'GenEvoAmericaAirForceGeneral' },
      { personaName: 'B', faction: 'GenEvoChinaTankGeneral' },
    ],
    losers: [
      { personaName: 'C', faction: 'GenEvoGLAStealthGeneral' },
      { personaName: 'D', faction: 'Unknown_6B8903C4' },
    ],
  });
  it('saves new maps, uses known labels, caches failed metadata and isolates other mods', async () => {
    const catalog = new MapCatalogService();
    vi.mocked(sourceGet).mockResolvedValue({ data: { isFound: false } } as any);
    await catalog.observe('genevo034_example_skrm_01', 'GenEvo', 'ra3b');
    await catalog.observe('genevo034_example_skrm_01', 'GenEvo', 'ra3b');
    expect(sourceGet).toHaveBeenCalledTimes(1);
    expect(catalog.list()).toContain(catalog.displayName('genevo034_example_skrm_01'));
    await catalog.observe('genevo033_sgor00_skrm_17', 'GenEvo', 'cnc');
    expect(catalog.displayName('genevo033_sgor00_skrm_17')).toBe('Delta Facility');
    await catalog.observe('othermod_new_map', 'OtherMod', 'ra3b');
    expect(sourceGet).toHaveBeenCalledTimes(1);
  });
  it('accepts bounded friendly metadata without rendering HTML', async () => {
    const catalog = new MapCatalogService();
    vi.mocked(sourceGet).mockResolvedValueOnce({
      data: { isFound: true, info: { displayName: 'New Desert' } },
    } as any);
    await catalog.observe('genevo034_new_map', 'GenEvo', 'ra3b');
    expect(catalog.displayName('genevo034_new_map')).toBe('New Desert');
    vi.mocked(sourceGet).mockResolvedValueOnce({
      data: { isFound: true, info: { displayName: '<script>bad</script>' } },
    } as any);
    await catalog.observe('genevo034_bad_label', 'GenEvo', 'ra3b');
    expect(catalog.displayName('genevo034_bad_label')).not.toContain('<');
  });
  it('persists one record per match, retains cache on outages and ignores unknown faction hashes', async () => {
    const record = rawMatch();
    vi.mocked(sourceGet).mockResolvedValue({ data: { records: [record, record] } } as any);
    const service = new ObservedMatchService();
    await service.refresh();
    expect(service.recent('genevo')).toHaveLength(1);
    expect(service.recent('ra3')).toEqual([]);
    expect(service.recent('genevo')[0].mode).toBe('2v2');
    expect(service.recent('genevo')[0].teams).toEqual([
      ['A', 'B'],
      ['C', 'D'],
    ]);
    expect(service.factions()['USA - Air Force General']).toBe(1);
    expect(service.factions()['GLA - Stealth General']).toBe(1);
    expect(normalizeGenevoFaction('Unknown_6B8903C4')).toBeUndefined();
    vi.mocked(sourceGet).mockRejectedValue(new Error('offline'));
    await new ObservedMatchService().refresh();
    expect(service.recent('genevo')).toHaveLength(1);
    expect((db.prepare('SELECT COUNT(*) AS n FROM observed_matches').get() as any).n).toBe(1);
  });
  it('rejects corrupt, expired and wrong-mod records', () => {
    for (const patch of [
      { modFamilyName: 'other' },
      { startTime: 'bad' },
      { id: '../evil' },
      { startTime: '2020-01-01' },
      { map: 123 },
      { winners: [] },
      { losers: [null] },
    ])
      expect(parseObservedMatch({ ...rawMatch(), ...patch })).toBeUndefined();
  });
});
