import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Client, Collection, TextChannel } from 'discord.js';
import { connectDatabase } from '../../src/database/connection';
import { db } from '../../src/database/sqlite';
import { guildRepository } from '../../src/repositories/guild.repository';
import { trackedStreamerRepository } from '../../src/repositories/tracked-streamer.repository';
import { classifyGameContent } from '../../src/config/games';
import { TwitchNotifierService } from '../../src/services/twitch-notifier.service';
import { twitchService, TwitchStream } from '../../src/services/twitch.service';
import * as preview from '../../src/utils/twitch-preview';
import { GAME_CONFIGS } from '../../src/config/games';

beforeAll(async () => {
  await connectDatabase();
});
beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(preview, 'fetchTwitchPreview').mockResolvedValue(undefined);
  db.prepare('DELETE FROM twitch_notified_streams').run();
});
const stream = (userId: string, title: string): TwitchStream => ({
  id: userId,
  userId,
  userName: 'streamer',
  title,
  gameName: 'Red Alert 3',
  viewerCount: 2,
  thumbnailUrl: '',
  startedAt: '',
});

describe('GenEvo stream discovery and routing', () => {
  it.each(['snapshot', 'missing', 'permission', 'ambiguous'] as const)(
    'handles %s preview delivery',
    async (mode) => {
      const send = vi.fn().mockResolvedValue({});
      const image = Buffer.from('jpeg snapshot');
      vi.mocked(preview.fetchTwitchPreview).mockResolvedValue(
        mode === 'missing' ? undefined : image,
      );
      if (mode === 'permission') send.mockRejectedValueOnce({ code: 50013 });
      if (mode === 'ambiguous') send.mockRejectedValueOnce(new Error('timeout'));
      const channel = Object.create(TextChannel.prototype);
      channel.send = send;
      channel.name = 'live';
      const guildId = 'preview-' + mode;
      guildRepository.upsert(guildId, {
        game: 'genevo',
        twitchChannelId: 'channel',
        twitchNotifierEnabled: 1,
      });
      const guild = {
        id: guildId,
        name: guildId,
        channels: { cache: new Collection([['channel', channel]]) },
      };
      vi.spyOn(twitchService, 'getUserByLogin').mockResolvedValue(null);
      await (new TwitchNotifierService() as any).handleStream(
        { guilds: { cache: new Collection([[guildId, guild]]) } },
        stream('image-' + mode, 'GenEvo'),
      );
      expect(send).toHaveBeenCalledTimes(mode === 'permission' ? 2 : 1);
      const payload = send.mock.calls.at(-1)![0];
      expect(payload.allowedMentions).toEqual({ parse: [] });
      expect(payload.embeds[0].toJSON().image.url).toBe(
        mode === 'missing' || mode === 'permission'
          ? GAME_CONFIGS.genevo.artworkUrl
          : 'attachment://twitch-preview.jpg',
      );
      if (mode === 'snapshot') expect(payload.files[0].attachment).toEqual(image);
    },
  );
  it.each([
    'GenEvo 2v2',
    'Generals Evolution on RA3',
    'GEN EVO',
    'Gen-Evo',
    'Generals: Evolution',
    'Gen_Evo',
  ])('recognizes %s', (title) => {
    expect(classifyGameContent(title)).toBe('genevo');
  });
  it('does not treat regular Zero Hour or other C&C games as GenEvo', () => {
    expect(classifyGameContent('Zero Hour ranked')).toBe('other');
    expect(classifyGameContent("Kane's Wrath")).toBe('other');
    expect(classifyGameContent('gen evolution of this game')).toBe('neutral');
  });
  it('discovers RA3, tracked and Generals-category GenEvo streams, without duplicates', async () => {
    const notifier = new TwitchNotifierService() as any;
    notifier.gameId = 'ra3';
    notifier.additionalGameIds = ['generals'];
    vi.spyOn(trackedStreamerRepository, 'findAll').mockReturnValue([
      {
        id: 1,
        guildId: 'g',
        platform: 'twitch',
        platformId: '3',
        displayName: 'tracked',
        addedAt: '',
      },
    ]);
    vi.spyOn(twitchService, 'getStreamsByGame').mockImplementation(async (id) =>
      id === 'ra3'
        ? [stream('1', 'RA3 ladder'), stream('2', 'GenEvo')]
        : [stream('2', 'GenEvo'), stream('4', 'Zero Hour'), stream('5', 'Generals Evolution')],
    );
    vi.spyOn(twitchService, 'getStreamsByUsers').mockResolvedValue([
      stream('3', 'GenEvo on another category'),
    ]);
    const handle = vi.spyOn(notifier, 'handleStream').mockResolvedValue(undefined);
    await notifier.poll({} as Client);
    expect(handle.mock.calls.map((call) => (call[1] as TwitchStream).userId).sort()).toEqual([
      '1',
      '2',
      '3',
      '5',
    ]);
  });
  it('one tracked-streamer configuration does not suppress notifications to other matching guilds', async () => {
    const sends = [
      vi.fn().mockResolvedValue({}),
      vi.fn().mockResolvedValue({}),
      vi.fn().mockResolvedValue({}),
    ];
    const guilds = ['gen-one', 'gen-two', 'ra3-only'].map((id, index) => {
      const channel = Object.create(TextChannel.prototype);
      channel.send = sends[index];
      channel.name = 'live';
      guildRepository.upsert(id, {
        game: index < 2 ? 'genevo' : 'ra3',
        twitchChannelId: 'channel',
        twitchNotifierEnabled: 1,
      });
      return [
        id,
        { id, name: id, channels: { cache: new Collection([['channel', channel]]) } },
      ] as const;
    });
    trackedStreamerRepository.addStreamer('gen-one', 'twitch', '99', 'tracked');
    vi.spyOn(twitchService, 'getUserByLogin').mockResolvedValue(null);
    const notifier = new TwitchNotifierService() as any;
    await notifier.handleStream(
      { guilds: { cache: new Collection(guilds) } },
      stream('99', 'Generals Evolution 2v2'),
    );
    expect(sends[0]).toHaveBeenCalledOnce();
    expect(sends[1]).toHaveBeenCalledOnce();
    expect(sends[2]).not.toHaveBeenCalled();
  });
});
