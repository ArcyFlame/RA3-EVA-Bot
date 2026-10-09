import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Collection, TextChannel } from 'discord.js';
import { connectDatabase } from '../../src/database/connection';
import { guildRepository } from '../../src/repositories/guild.repository';
import { activityRankRepository as activity } from '../../src/repositories/activity-rank.repository';
import { replayRatingRepository as repo } from '../../src/repositories/replay-rating.repository';
import { ReplayRatingService } from '../../src/services/replay-rating.service';
import { activityRankService } from '../../src/services/activity-rank.service';
beforeAll(async () => {
  await connectDatabase();
});
beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(activityRankService, 'syncMemberRank').mockResolvedValue({ status: 'unchanged' });
});
let sequence = 0;
function fixture(game: 'genevo' | 'ra3' = 'genevo') {
  const id = 'rating-service-' + ++sequence,
    channelId = '1321748469735620640';
  guildRepository.upsert(id, { game, activityRanksEnabled: 1 });
  const member = {
    id: 'voter',
    user: { bot: false, createdTimestamp: Date.now() - 86400000 * 365 },
  };
  const guild: any = {
    id,
    members: { fetch: vi.fn().mockResolvedValue(member), me: { id: 'bot' } },
  };
  const card = repo.create({
    guild_id: id,
    user_id: 'author',
    channel_id: channelId,
    source_message_id: 'source',
    attachment_id: 'file',
    fingerprint: sequence.toString(16).padStart(64, '0'),
    filename: 'match.RA3Replay',
  });
  repo.attachMessage(card.id, 'rating-' + sequence);
  const message: any = { id: 'rating-' + sequence, guildId: id, channelId, guild };
  const reaction: any = { emoji: { name: '👍' }, message };
  const service = new ReplayRatingService();
  vi.spyOn(service, 'refresh').mockImplementation(() => undefined);
  return { id, card, guild, message, reaction, service, member, channelId };
}
describe('replay reaction safety', () => {
  it('accepts a downvote only when an admin enables dual voting', async () => {
    const f = fixture();
    const reaction: any = { ...f.reaction, emoji: { name: '👎' } };
    await f.service.handleReaction(reaction, { id: 'voter' } as any);
    expect(repo.totals(f.card.id).down).toBe(0);
    activity.updateSettings(f.id, { ratingMode: 'both' }, 0);
    await f.service.handleReaction(reaction, { id: 'voter' } as any);
    expect(repo.totals(f.card.id).down).toBe(1);
    expect(activity.getMember(f.id, 'author')).toBeUndefined();
  });
  it.each(['👍', '👎'])(
    'removes the uploader self-reaction %s, awards nothing and privately explains once per day',
    async (emoji) => {
      const f = fixture();
      const users = { remove: vi.fn().mockResolvedValue(null) };
      const author: any = { id: 'author', send: vi.fn().mockResolvedValue(null) };
      const reaction: any = { ...f.reaction, emoji: { name: emoji }, users };
      for (let n = 0; n < 3; n++) await f.service.handleReaction(reaction, author);
      expect(users.remove).toHaveBeenCalledWith('author');
      expect(users.remove).toHaveBeenCalledTimes(3);
      expect(author.send).toHaveBeenCalledTimes(1);
      expect(author.send.mock.calls[0][0].content).toContain('reaction was removed');
      expect(author.send.mock.calls[0][0].allowedMentions).toEqual({ parse: [] });
      expect(repo.totals(f.card.id).up).toBe(0);
      expect(activity.getMember(f.id, 'author')).toBeUndefined();
      await new ReplayRatingService().handleReaction(reaction, author);
      expect(author.send).toHaveBeenCalledTimes(1);
      await f.service.handleReaction(reaction, author, true);
      expect(users.remove).toHaveBeenCalledTimes(4);
    },
  );
  it('still blocks self XP if reaction removal is denied and handles closed DMs without public messages', async () => {
    const f = fixture();
    const author: any = {
      id: 'author',
      send: vi.fn().mockRejectedValue(new Error('DMs disabled')),
    };
    await f.service.handleReaction(
      {
        ...f.reaction,
        users: { remove: vi.fn().mockRejectedValue(new Error('Missing Manage Messages')) },
      } as any,
      author,
    );
    expect(author.send.mock.calls[0][0].content).toContain('Manage Messages');
    expect(repo.totals(f.card.id).up).toBe(0);
    expect(f.guild.members.fetch).not.toHaveBeenCalled();
  });
  it('bounds historical scans and creates cards without backdated upload XP', async () => {
    const f = fixture();
    const channel: any = Object.create(TextChannel.prototype);
    const messages = new Collection(
      Array.from({ length: 25 }, (_, index) => {
        const attachment = {
          id: String(index + 500),
          name: 'old.RA3Replay',
          size: 256,
          url: `https://cdn.discordapp.com/attachments/${f.channelId}/${index + 500}/old.RA3Replay`,
        };
        return [
          String(index),
          {
            id: String(index),
            channelId: f.channelId,
            author: { id: 'author' },
            createdTimestamp: Date.now() - 86400000,
            attachments: new Collection([[attachment.id, attachment]]),
          },
        ];
      }),
    );
    Object.defineProperties(channel, {
      id: { value: f.channelId },
      messages: { value: { fetch: vi.fn().mockResolvedValue(messages) } },
    });
    f.guild.channels = { fetch: vi.fn().mockResolvedValue(channel) };
    vi.spyOn(activityRankService, 'downloadReplay').mockImplementation(async (a) =>
      a.id.padStart(64, '0'),
    );
    const post = vi.spyOn(f.service, 'post').mockResolvedValue(true);
    expect(await f.service.scan(f.guild)).toEqual({ cards: 10, checked: 10 });
    expect(post).toHaveBeenCalledTimes(10);
    expect(activity.getMember(f.id, 'author')).toBeUndefined();
    await expect(f.service.scan(f.guild)).rejects.toThrow('10 minutes');
  });
  it('bounds scan downloads even when every file is a duplicate', async () => {
    const f = fixture();
    const channel: any = Object.create(TextChannel.prototype);
    const messages = new Collection(
      Array.from({ length: 25 }, (_, index) => [
        String(index),
        {
          id: String(index),
          author: { id: 'author' },
          createdTimestamp: Date.now() - 86400000,
          attachments: new Collection([
            [
              'file',
              {
                id: 'file',
                name: 'same.RA3Replay',
                size: 256,
                url: `https://cdn.discordapp.com/attachments/${f.channelId}/500/same.RA3Replay`,
              },
            ],
          ]),
        },
      ]),
    );
    Object.defineProperties(channel, {
      id: { value: f.channelId },
      messages: { value: { fetch: vi.fn().mockResolvedValue(messages) } },
    });
    f.guild.channels = { fetch: vi.fn().mockResolvedValue(channel) };
    const download = vi
      .spyOn(activityRankService, 'downloadReplay')
      .mockResolvedValue(f.card.fingerprint);
    expect(await f.service.scan(f.guild)).toEqual({ cards: 0, checked: 20 });
    expect(download).toHaveBeenCalledTimes(20);
  });
  it('orders reaction clears after in-flight votes so a delayed member fetch cannot recreate cleared votes', async () => {
    const f = fixture();
    let release!: (value: any) => void;
    f.guild.members.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const vote = f.service.handleReaction(f.reaction, { id: 'voter' } as any);
    const cleared = f.service.clear(f.message);
    await vi.waitFor(() => expect(release).toBeDefined());
    release(f.member);
    await Promise.all([vote, cleared]);
    expect(repo.totals(f.card.id)).toEqual({ up: 0, down: 0 });
  });
  it('ignores unrelated cards, emoji, bot votes and self votes before fetching members', async () => {
    const f = fixture();
    for (const [reaction, user] of [
      [{ ...f.reaction, message: { ...f.message, id: 'unknown' } }, { id: 'voter' }],
      [{ ...f.reaction, emoji: { name: '🔥' } }, { id: 'voter' }],
      [{ ...f.reaction, emoji: { name: '👎' } }, { id: 'voter' }],
      [f.reaction, { id: 'voter', bot: true }],
      [f.reaction, { id: 'author' }],
    ])
      await f.service.handleReaction(reaction as any, user as any);
    expect(f.guild.members.fetch).not.toHaveBeenCalled();
    expect(repo.totals(f.card.id)).toEqual({ up: 0, down: 0 });
  });
  it('only records votes for the configured GenEvo channel', async () => {
    const ra3 = fixture('ra3');
    await ra3.service.handleReaction(ra3.reaction, { id: 'voter' } as any);
    expect(ra3.guild.members.fetch).not.toHaveBeenCalled();
    const f = fixture();
    f.message.channelId = 'wrong';
    await f.service.handleReaction(f.reaction, { id: 'voter' } as any);
    expect(f.guild.members.fetch).not.toHaveBeenCalled();
  });
  it('rejects young accounts, outsiders and features disabled during the fresh member fetch', async () => {
    const f = fixture();
    f.member.user.createdTimestamp = Date.now();
    await f.service.handleReaction(f.reaction, { id: 'voter' } as any);
    f.guild.members.fetch.mockResolvedValueOnce(null);
    await f.service.handleReaction(f.reaction, { id: 'outsider' } as any);
    f.guild.members.fetch.mockImplementationOnce(async () => {
      guildRepository.toggleFeature(f.id, 'activityRanks', false);
      return { ...f.member, user: { ...f.member.user, createdTimestamp: 0 } };
    });
    await f.service.handleReaction(f.reaction, { id: 'voter2' } as any);
    expect(repo.totals(f.card.id)).toEqual({ up: 0, down: 0 });
  });
  it('serializes concurrent votes and awards only the unique net support', async () => {
    const f = fixture();
    await Promise.all(
      Array.from({ length: 15 }, () => f.service.handleReaction(f.reaction, { id: 'a' } as any)),
    );
    await f.service.handleReaction(f.reaction, { id: 'b' } as any);
    expect(repo.totals(f.card.id)).toEqual({ up: 2, down: 0 });
    expect(repo.get(f.card.id)?.bonus_awarded).toBe(10);
    expect(activity.getMember(f.id, 'author')?.points).toBe(10);
  });
  it('posts a separate card without editing or deleting the uploader message, and recovers an interrupted send', async () => {
    const f = fixture();
    const sent = {
      id: 'new-card',
      react: vi.fn().mockResolvedValue(null),
      author: { id: 'bot' },
      embeds: [],
    };
    const channel: any = Object.create(TextChannel.prototype);
    Object.defineProperties(channel, {
      messages: { value: { fetch: vi.fn().mockResolvedValue(new Collection()) } },
      permissionsFor: { value: () => ({ has: () => true }) },
      send: { value: vi.fn().mockResolvedValue(sent) },
    });
    const source: any = {
      id: 'upload',
      guild: f.guild,
      channelId: f.channelId,
      channel,
      author: { id: 'author' },
      client: { user: { id: 'bot' } },
      edit: vi.fn(),
      delete: vi.fn(),
    };
    const hash = 'f'.repeat(64);
    expect(
      await f.service.post(source, { id: 'file', name: '@everyone.RA3Replay' } as any, hash),
    ).toBe(true);
    expect(channel.send.mock.calls[0][0].allowedMentions).toEqual({
      parse: [],
      repliedUser: false,
    });
    expect(sent.react.mock.calls.map((c: any[]) => c[0])).toEqual(['👍']);
    expect(source.edit).not.toHaveBeenCalled();
    expect(source.delete).not.toHaveBeenCalled();
    expect(
      await f.service.post(source, { id: 'file', name: 'duplicate.RA3Replay' } as any, hash),
    ).toBe(false);
    expect(channel.send).toHaveBeenCalledTimes(1);
    const pending = repo.create({
      ...f.card,
      fingerprint: 'e'.repeat(64),
      card_message_id: undefined,
    } as any);
    channel.messages.fetch.mockResolvedValue(
      new Collection([
        [
          'recovered',
          {
            ...sent,
            id: 'recovered',
            embeds: [{ footer: { text: `Replay #${pending.id} - rules` } }],
          },
        ],
      ]),
    );
    expect(await f.service.post(source, { id: 'file' } as any, pending.fingerprint)).toBe(false);
    expect(repo.get(pending.id)?.card_message_id).toBe('recovered');
    expect(channel.send).toHaveBeenCalledTimes(1);
  });
});
