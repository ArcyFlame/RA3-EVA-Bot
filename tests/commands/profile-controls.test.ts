import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectDatabase } from '../../src/database/connection';
import { guildRepository } from '../../src/repositories/guild.repository';
import { userRepository } from '../../src/repositories/user.repository';
import { ra3StatsService } from '../../src/services/ra3-stats.service';
import {
  shatabrickService,
  parseShatabrickProfileHtml,
} from '../../src/services/shatabrick.service';
import { buildDiscordProfileEmbed } from '../../src/commands/profile/profile.view';
import { profileMenu, profileSessions } from '../../src/commands/profile/profile-menu';
import { execute as selectProfile } from '../../src/interactions/selectMenus/profile-platform.select';
import { execute as submitLink } from '../../src/interactions/modals/link-account.modal';
import { execute as confirmLink } from '../../src/interactions/buttons/link-confirm.button';
import { parseLinkIdentifier, pendingLinks } from '../../src/commands/profile/link-confirmation';
import { execute as statsCommand } from '../../src/commands/stats/stats.command';
import { generateBarChart } from '../../src/utils/charts';
import { execute as infoCommand } from '../../src/commands/info/info.command';
import { CNC_ONLINE, RA3_BATTLE_NET } from '../../src/utils/emojis';

vi.mock('../../src/utils/charts', () => ({
  generateBarChart: vi.fn(),
  statsChartPalettes: () => [{}, {}, {}],
}));
beforeAll(async () => {
  await connectDatabase();
});
beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.spyOn(ra3StatsService, 'fetch').mockResolvedValue({ tournament_wins: {} } as any);
  vi.spyOn(shatabrickService, 'resolve').mockResolvedValue(null);
});
let sequence = 0;
function fixture(game: 'ra3' | 'genevo' = 'ra3') {
  const id = 'profile-controls-' + ++sequence;
  guildRepository.upsert(id, { game, activityRanksEnabled: 1 });
  const target: any = {
    id: 'profile-user-' + sequence,
    username: 'Arcy',
    displayName: 'Arcy',
    globalName: 'Arcy',
    displayAvatarURL: () => 'https://example.com/avatar.png',
  };
  userRepository.upsertFromMember(target.id, target.username);
  const interaction: any = {
    guildId: id,
    user: target,
    reply: vi.fn(),
    deferReply: vi.fn(),
    deferUpdate: vi.fn(),
    update: vi.fn(),
    editReply: vi.fn(),
    followUp: vi.fn(),
    values: ['ra3b'],
    options: { getInteger: () => null },
  };
  return { id, target, interaction };
}
const persona = (name = 'Arcy') => ({
  personaId: 138466,
  personaName: name,
  ladder1v1: null,
  ladder2v2: null,
  ladder3v3: null,
});
describe('private platform selection and linked identity', () => {
  it('uses custom platform emojis, one platform at a time and places wins after activity', async () => {
    const f = fixture();
    userRepository.linkRa3BattleNet(f.target.id, 'Arcy', 138466);
    vi.spyOn(ra3StatsService, 'getRa3bPersonaStats').mockResolvedValue(persona());
    const embed = (await buildDiscordProfileEmbed(f.target, 'en', 'ra3', f.id, 'ra3b')).toJSON();
    expect(embed.description).toBeUndefined();
    expect(embed.fields![1].name).toContain('Tournament Wins');
    expect(embed.fields!.some((field) => field.name.includes(RA3_BATTLE_NET))).toBe(true);
    expect(embed.fields!.some((field) => field.name.includes(CNC_ONLINE))).toBe(false);
    expect(shatabrickService.resolve).not.toHaveBeenCalled();
  });
  it('never calls Shatabrick or displays RA3 ladder records for GenEvo', async () => {
    const f = fixture('genevo');
    userRepository.linkShatabrick(f.target.id, 'Arcy');
    userRepository.linkRa3BattleNet(f.target.id, 'Arcy', 138466);
    const get = vi
      .spyOn(ra3StatsService, 'getRa3bPersonaStats')
      .mockImplementation(async (_id, game) =>
        game === 'genevo' ? persona() : { ...persona(), ladder1v1: { elo: 9999 } as any },
      );
    const embed = (await buildDiscordProfileEmbed(f.target, 'en', 'genevo', f.id, 'cnc')).toJSON();
    expect(shatabrickService.resolve).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledWith(138466, 'genevo');
    expect(JSON.stringify(embed)).not.toContain('9999');
    expect(profileMenu('key', 'genevo', 'ra3b')[0].toJSON().components[0].options).toHaveLength(1);
  });
  it('rejects mismatched saved nickname/ID instead of showing another player', async () => {
    const f = fixture();
    userRepository.linkRa3BattleNet(f.target.id, 'Arcy', 103268);
    vi.spyOn(ra3StatsService, 'getRa3bPersonaStats').mockResolvedValue(persona('VanderLinde'));
    const embed = (await buildDiscordProfileEmbed(f.target, 'en', 'ra3', f.id, 'ra3b')).toJSON();
    expect(JSON.stringify(embed)).toContain('do not match');
    expect(JSON.stringify(embed)).not.toContain('VanderLinde');
  });
  it('binds menus to their owner/server and never reuses another platform numeric ID', async () => {
    const f = fixture();
    const key = profileSessions.create({
      ownerId: f.target.id,
      guildId: f.id,
      query: '707',
      game: 'ra3',
      lang: 'en',
      initialPlatform: 'cnc',
    });
    f.interaction.customId = 'profile_platform:' + key;
    const get = vi.spyOn(ra3StatsService, 'getRa3bPersonaStats').mockResolvedValue(persona());
    await selectProfile(null as any, { ...f.interaction, user: { id: 'other' } });
    expect(f.interaction.reply).toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    await selectProfile(null as any, f.interaction);
    expect(f.interaction.deferUpdate).toHaveBeenCalled();
    expect(f.interaction.editReply.mock.calls[0][0].embeds[0].data.description).toContain(
      'platform-specific',
    );
    expect(get).not.toHaveBeenCalled();
  });
});
describe('confirmed account linking', () => {
  it('accepts only the expected HTTPS profile URL and matching platform', () => {
    expect(parseLinkIdentifier('https://ra3battle.net/persona/138466', 'ra3b')).toBe('138466');
    expect(
      parseLinkIdentifier(
        'https://www.shatabrick.com/cco/ra3/index.php?g=ra&a=pp&id=707',
        'shatabrick',
      ),
    ).toBe('707');
    for (const url of [
      'https://ra3battle.net.evil.example/persona/138466',
      'https://user:pass@ra3battle.net/persona/138466',
      'http://ra3battle.net/persona/138466',
      'https://127.0.0.1/persona/138466',
      'https://ra3battle.net:8443/persona/138466',
    ])
      expect(parseLinkIdentifier(url, 'ra3b')).toBeUndefined();
    expect(
      parseLinkIdentifier('https://ra3battle.net/persona/138466', 'shatabrick'),
    ).toBeUndefined();
  });
  it('does not save until the same user confirms and consumes the confirmation once', async () => {
    const f = fixture();
    f.interaction.customId = 'link_account_ra3b';
    f.interaction.fields = { getTextInputValue: () => 'https://ra3battle.net/persona/138466' };
    vi.spyOn(ra3StatsService, 'getRa3bPersonaStats').mockResolvedValue(persona());
    await submitLink(null as any, f.interaction);
    expect(userRepository.findByDiscordId(f.target.id)?.ra3bPersonaId).toBeUndefined();
    const customId =
      f.interaction.editReply.mock.calls[0][0].components[0].toJSON().components[0].custom_id;
    await confirmLink(null as any, { ...f.interaction, customId, user: { id: 'other' } });
    expect(userRepository.findByDiscordId(f.target.id)?.ra3bPersonaId).toBeUndefined();
    await confirmLink(null as any, { ...f.interaction, customId });
    expect(userRepository.findByDiscordId(f.target.id)?.ra3bPersonaId).toBe(138466);
    expect(pendingLinks.get(customId.split(':')[2], f.target.id, f.id)).toBeUndefined();
  });
  it('expires confirmations after ten minutes and blocks GenEvo Shatabrick submissions', async () => {
    const f = fixture('genevo');
    f.interaction.customId = 'link_account_shatabrick';
    await submitLink(null as any, f.interaction);
    expect(f.interaction.reply).toHaveBeenCalled();
    expect(shatabrickService.resolve).not.toHaveBeenCalled();
    const key = pendingLinks.create({
      ownerId: f.target.id,
      guildId: f.id,
      game: 'genevo',
      lang: 'en',
      platform: 'ra3b',
      nickname: 'Arcy',
      profileId: 138466,
    });
    const now = Date.now();
    const time = vi.spyOn(Date, 'now').mockReturnValue(now + 601000);
    expect(pendingLinks.get(key, f.target.id, f.id)).toBeUndefined();
    time.mockRestore();
  });
});
describe('profile artwork and chart controls', () => {
  it('resolves rank artwork relative to the profile and separates lifetime and season results', () => {
    const profile = parseShatabrickProfileHtml(
      `<body><h1>Arcy</h1><h3>Clan: Sol Squadron &nbsp; Clan Tag: SOL</h3><img src="images/IconsLarge/GDI13.png"><table><tr><th></th><th>Unranked</th><th>Ranked 1v1</th></tr><tr><td>GAMES</td><td>0</td><td>45</td></tr><tr><td>WINS</td><td>0</td><td>13</td></tr><tr><td>LOSSES</td><td>0</td><td>32</td></tr></table><table><tr><th>Mode</th><th>Rank</th><th>Elo</th><th>Wins</th><th>Losses</th></tr><tr><td>Ranked 1v1</td><td>21</td><td>1087</td><td>4</td><td>1</td></tr></table></body>`,
      707,
    )!;
    expect(profile.rankImageUrl).toBe(
      'https://www.shatabrick.com/cco/ra3/images/IconsLarge/GDI13.png',
    );
    expect(profile.clanName).toBe('Sol Squadron');
    expect(profile.clanTag).toBe('SOL');
    expect(profile.modes['Ranked 1v1']).toMatchObject({
      wins: 13,
      losses: 32,
      games: 45,
      seasonWins: 4,
      seasonLosses: 1,
    });
    expect(
      parseShatabrickProfileHtml(
        '<body><h1>Arcy</h1><img src="https://evil.example/IconsLarge/a.png"></body>',
        707,
      )?.rankImageUrl,
    ).toBeUndefined();
  });
  it('skips chart rendering when the server has disabled charts', async () => {
    const f = fixture();
    guildRepository.toggleFeature(f.id, 'charts', false);
    await statsCommand(null as any, f.interaction);
    expect(f.interaction.editReply).toHaveBeenCalled();
    expect(generateBarChart).not.toHaveBeenCalled();
    expect(f.interaction.followUp).not.toHaveBeenCalled();
  });
  it('uses the bot avatar in /info', async () => {
    const f = fixture('genevo');
    await infoCommand(
      { client: { user: { displayAvatarURL: () => 'https://example.com/bot-avatar.png' } } } as any,
      f.interaction,
    );
    expect(f.interaction.reply.mock.calls[0][0].embeds[0].data.thumbnail.url).toBe(
      'https://example.com/bot-avatar.png',
    );
  });
});
