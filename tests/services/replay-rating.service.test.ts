import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Collection, TextChannel, MessageFlags } from 'discord.js';
import { connectDatabase } from '../../src/database/connection';
import { guildRepository } from '../../src/repositories/guild.repository';
import { activityRankRepository as activity } from '../../src/repositories/activity-rank.repository';
import { replayRatingRepository as repo } from '../../src/repositories/replay-rating.repository';
import { ReplayRatingService, replayArchives } from '../../src/services/replay-rating.service';
import { activityRankService, replayFingerprint } from '../../src/services/activity-rank.service';
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
    joinedTimestamp: Date.now() - 86400000 * 30,
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
  const message: any = {
    id: 'rating-' + sequence,
    guildId: id,
    channelId,
    guild,
    author: { id: 'bot' },
  };
  const reaction: any = {
    emoji: { name: '👍' },
    message,
    users: { remove: vi.fn().mockResolvedValue(null) },
  };
  const service = new ReplayRatingService();
  vi.spyOn(service, 'refresh').mockImplementation(() => undefined);
  return { id, card, guild, message, reaction, service, member, channelId };
}
function button(f: ReturnType<typeof fixture>, userId = 'voter', direction = 'up'): any {
  return {
    customId: `replay_vote:${direction}:${f.card.id}`,
    guild: f.guild,
    guildId: f.id,
    channelId: f.channelId,
    message: f.message,
    client: { user: { id: 'bot' } },
    user: { id: userId, send: vi.fn() },
    deferReply: vi.fn().mockResolvedValue(null),
    editReply: vi.fn().mockResolvedValue(null),
  };
}
function archiveFixture() {
  const f = fixture();
  const bytes = Buffer.alloc(256);
  bytes.write('RA3 REPLAY HEADER');
  bytes[17] = 5;
  bytes[30] = sequence;
  const fingerprint = replayFingerprint(bytes)!;
  const file = { bytes, fingerprint };
  const attachment = {
    id: '500',
    name: 'upload.RA3Replay',
    size: bytes.length,
    url: `https://cdn.discordapp.com/attachments/${f.channelId}/500/upload.RA3Replay`,
  };
  const copy = { ...attachment, id: '600' };
  const sent: any = {
    id: `new-card-${sequence}`,
    author: { id: 'bot' },
    embeds: [],
    attachments: new Collection([['600', copy]]),
    react: vi.fn().mockResolvedValue(null),
  };
  sent.edit = vi.fn().mockImplementation(async (payload) => {
    if (payload.files) sent.attachments = new Collection([['600', copy]]);
    return sent;
  });
  const channel: any = Object.create(TextChannel.prototype);
  const fetch = vi
    .fn()
    .mockImplementation(async (arg) => (typeof arg === 'string' ? sent : new Collection()));
  Object.defineProperties(channel, {
    id: { value: f.channelId },
    messages: { value: { fetch } },
    permissionsFor: { value: () => ({ has: () => true }), configurable: true },
    send: { value: vi.fn().mockResolvedValue(sent) },
  });
  const source: any = {
    id: 'upload',
    guild: f.guild,
    channelId: f.channelId,
    channel,
    author: { id: 'author' },
    client: { user: { id: 'bot' } },
    content: 'Great game',
    attachments: new Collection([['500', attachment]]),
    edit: vi.fn(),
    delete: vi.fn().mockResolvedValue(null),
  };
  return { ...f, bytes, fingerprint, file, attachment, copy, sent, channel, source, fetch };
}
describe('replay reaction safety', () => {
  it('does not reintroduce an in-flight vote after an edit resets the card', async () => {
    const f = fixture();
    f.guild.members.fetch.mockImplementation(async () => {
      repo.editDescription(f.card.id, 'edited during member check', 0);
      return f.member;
    });
    const interaction = button(f);
    await f.service.handleVote(interaction);
    expect(repo.totals(f.card.id)).toEqual({ up: 0, down: 0 });
    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('replay changed'));
    expect(activity.getMember(f.id, 'author')).toBeUndefined();
  });
  it('archives and removes an original when Discord returns its copy only as a V2 file component', async () => {
    const f = archiveFixture();
    f.sent.channelId = f.channelId;
    f.sent.attachments = new Collection();
    f.sent.components = [
      {
        toJSON: () => ({
          type: 17,
          components: [
            {
              type: 13,
              name: f.attachment.name,
              file: {
                attachment_id: '600',
                url: `https://cdn.discordapp.com/attachments/${f.channelId}/600/upload.RA3Replay`,
              },
            },
          ],
        }),
      },
    ];
    expect(await f.service.post(f.source, f.attachment as any, f.fingerprint, f.file)).toBe(true);
    const card = repo.findFingerprint(f.id, f.fingerprint)!;
    expect(card.archive_attachment_id).toBe('600');
    expect(f.sent.edit.mock.calls[0][0].attachments).toEqual([
      { id: '600', filename: f.attachment.name },
    ]);
    expect(f.source.delete).toHaveBeenCalledOnce();
    expect(await f.service.post(f.source, f.attachment as any, f.fingerprint, f.file)).toBe(false);
    expect(f.channel.send).toHaveBeenCalledOnce();
  });
  it('does not trust unresolved or foreign V2 file references for archive verification', () => {
    const f = archiveFixture();
    f.sent.channelId = f.channelId;
    f.sent.attachments = new Collection();
    for (const url of [
      'attachment://upload.RA3Replay',
      'https://evil.example/file',
      'https://cdn.discordapp.com/attachments/other-channel/600/upload.RA3Replay',
    ]) {
      f.sent.components = [
        {
          toJSON: () => ({
            type: 13,
            name: 'upload.RA3Replay',
            file: { attachment_id: '600', url },
          }),
        },
      ];
      expect(replayArchives(f.sent)).toEqual([]);
    }
  });
  it.each(['up', 'down'])(
    'rejects self %s votes using a private server reply, never a DM',
    async (direction) => {
      const f = fixture();
      const interaction = button(f, 'author', direction);
      await f.service.handleVote(interaction);
      expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining('your own replay'),
      );
      expect(interaction.user.send).not.toHaveBeenCalled();
      expect(f.guild.members.fetch).not.toHaveBeenCalled();
      expect(repo.totals(f.card.id)).toEqual({ up: 0, down: 0 });
    },
  );
  it('removes arbitrary emojis only from managed replay cards without changing votes', async () => {
    const f = fixture();
    repo.vote(f.card.id, 'voter', 1);
    const reaction = { ...f.reaction, emoji: { name: '🔥' } };
    await f.service.handleReaction(reaction, { id: 'other' } as any);
    expect(reaction.users.remove).toHaveBeenCalledWith('other');
    await f.service.clear(f.message);
    expect(repo.totals(f.card.id).up).toBe(1);
    reaction.users.remove.mockClear();
    await f.service.handleReaction({ ...reaction, message: { ...f.message, id: 'unrelated' } }, {
      id: 'other',
    } as any);
    expect(reaction.users.remove).not.toHaveBeenCalled();
  });
  it.each(['guild', 'channel', 'message', 'author', 'closed'])(
    'rejects votes bound to a different %s',
    async (kind) => {
      const f = fixture();
      const interaction = button(f);
      if (kind === 'guild') interaction.guildId = 'another-guild';
      if (kind === 'channel') interaction.channelId = 'another-channel';
      if (kind === 'message') interaction.message.id = 'another-message';
      if (kind === 'author') interaction.message.author.id = 'another-bot';
      if (kind === 'closed') repo.closeMessage(f.message.id);
      await f.service.handleVote(interaction);
      expect(f.guild.members.fetch).not.toHaveBeenCalled();
      expect(repo.totals(f.card.id).up).toBe(0);
    },
  );
  it('allows one qualifying like to earn XP when the admin selects a minimum of one', async () => {
    const f = fixture();
    activity.updateSettings(f.id, { ratingMinVotes: 1 }, 0);
    const interaction = button(f);
    await f.service.handleVote(interaction);
    expect(activity.getMember(f.id, 'author')?.points).toBe(5);
    expect(interaction.editReply).toHaveBeenCalledWith('Vote saved. The uploader earned 5 XP.');
    expect(activityRankService.syncMemberRank).toHaveBeenCalled();
  });
  it('accepts a downvote only when an admin enables dual voting', async () => {
    const f = fixture();
    const interaction = button(f, 'voter', 'down');
    await f.service.handleVote(interaction);
    expect(repo.totals(f.card.id).down).toBe(0);
    activity.updateSettings(f.id, { ratingMode: 'both' }, 0);
    await f.service.handleVote(interaction);
    expect(repo.totals(f.card.id).down).toBe(1);
    expect(activity.getMember(f.id, 'author')).toBeUndefined();
  });
  it.each(['👍', '👎'])(
    'removes the uploader self-reaction %s without DMs or XP',
    async (emoji) => {
      const f = fixture();
      const users = { remove: vi.fn().mockResolvedValue(null) };
      const author: any = { id: 'author', send: vi.fn().mockResolvedValue(null) };
      const reaction: any = { ...f.reaction, emoji: { name: emoji }, users };
      for (let n = 0; n < 3; n++) await f.service.handleReaction(reaction, author);
      expect(users.remove).toHaveBeenCalledWith('author');
      expect(users.remove).toHaveBeenCalledTimes(3);
      expect(author.send).not.toHaveBeenCalled();
      expect(repo.totals(f.card.id).up).toBe(0);
      expect(activity.getMember(f.id, 'author')).toBeUndefined();
      await new ReplayRatingService().handleReaction(reaction, author);
      expect(author.send).not.toHaveBeenCalled();
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
    expect(author.send).not.toHaveBeenCalled();
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
  it('recovers missing cards on startup even after the upload XP cap is full', async () => {
    const f = fixture();
    const channel: any = Object.create(TextChannel.prototype);
    const source: any = {
      id: 'missed-upload',
      author: { id: 'author' },
      createdTimestamp: Date.now() - 1000,
      attachments: new Collection([
        [
          'file',
          {
            id: 'file',
            name: 'missed.RA3Replay',
            size: 256,
            url: `https://cdn.discordapp.com/attachments/${f.channelId}/500/missed.RA3Replay`,
          },
        ],
      ]),
    };
    Object.defineProperties(channel, {
      id: { value: f.channelId },
      messages: {
        value: { fetch: vi.fn().mockResolvedValue(new Collection([[source.id, source]])) },
      },
    });
    f.guild.channels = { fetch: vi.fn().mockResolvedValue(channel) };
    const date = new Date().toISOString().slice(0, 10);
    activity.recordActivity({
      guildId: f.id,
      userId: 'author',
      activityDate: date,
      hasCncPing: false,
      replayFingerprints: ['a', 'b', 'c'].map((c) => c.repeat(64)),
    });
    vi.spyOn(activityRankService, 'downloadReplay').mockResolvedValue('d'.repeat(64));
    const post = vi.spyOn(f.service, 'post').mockResolvedValue(true);
    const client: any = { guilds: { cache: new Collection([[f.id, f.guild]]) } };
    await f.service.reconcileRecentCards(client, f.id);
    expect(post).toHaveBeenCalledWith(source, expect.anything(), 'd'.repeat(64));
    expect(activity.getMember(f.id, 'author')?.points).toBe(75);
    await f.service.reconcileRecentCards(client, f.id);
    expect(post).toHaveBeenCalledTimes(1);
    const afterCooldown = Date.now() + 600001;
    vi.spyOn(Date, 'now').mockReturnValue(afterCooldown);
    await f.service.reconcileRecentCards(client, f.id);
    expect(post).toHaveBeenCalledTimes(2);
    expect(activity.getMember(f.id, 'author')?.points).toBe(75);
    activity.updateSettings(f.id, { replayAutoScan: false }, 0);
    vi.mocked(Date.now).mockReturnValue(afterCooldown + 600001);
    await f.service.reconcileRecentCards(client, f.id);
    expect(post).toHaveBeenCalledTimes(2);
  });
  it('skips automatic recovery when scanning is off but still allows a manual scan', async () => {
    const f = fixture();
    activity.updateSettings(f.id, { replayAutoScan: false }, 0);
    f.guild.channels = { fetch: vi.fn() };
    expect(await f.service.scan(f.guild, { automatic: true })).toEqual({ cards: 0, checked: 0 });
    expect(f.guild.channels.fetch).not.toHaveBeenCalled();
    f.guild.channels.fetch.mockResolvedValue(null);
    await expect(f.service.scan(f.guild)).rejects.toThrow('text channel');
  });
  it('keeps button votes when legacy reactions are cleared during an in-flight vote', async () => {
    const f = fixture();
    let release!: (value: any) => void;
    f.guild.members.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const vote = f.service.handleVote(button(f));
    const cleared = f.service.clear(f.message);
    await vi.waitFor(() => expect(release).toBeDefined());
    release(f.member);
    await Promise.all([vote, cleared]);
    expect(repo.totals(f.card.id)).toEqual({ up: 1, down: 0 });
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
    await ra3.service.handleVote(button(ra3));
    expect(ra3.guild.members.fetch).not.toHaveBeenCalled();
    const f = fixture();
    const interaction = button(f);
    interaction.channelId = 'wrong';
    await f.service.handleVote(interaction);
    expect(f.guild.members.fetch).not.toHaveBeenCalled();
  });
  it('rejects young accounts, outsiders and features disabled during the fresh member fetch', async () => {
    const f = fixture();
    f.member.user.createdTimestamp = Date.now();
    await f.service.handleVote(button(f));
    f.guild.members.fetch.mockResolvedValueOnce(null);
    await f.service.handleVote(button(f, 'outsider'));
    f.guild.members.fetch.mockImplementationOnce(async () => {
      guildRepository.toggleFeature(f.id, 'activityRanks', false);
      return { ...f.member, user: { ...f.member.user, createdTimestamp: 0 } };
    });
    await f.service.handleVote(button(f, 'voter2'));
    expect(repo.totals(f.card.id)).toEqual({ up: 0, down: 0 });
  });
  it('serializes concurrent votes and awards only the unique net support', async () => {
    const f = fixture();
    await Promise.all(Array.from({ length: 15 }, () => f.service.handleVote(button(f, 'a'))));
    expect(activity.getMember(f.id, 'author')).toBeUndefined();
    await f.service.handleVote(button(f, 'b'));
    expect(repo.totals(f.card.id)).toEqual({ up: 1, down: 0 });
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 4000);
    await f.service.handleVote(button(f, 'a'));
    expect(repo.totals(f.card.id)).toEqual({ up: 2, down: 0 });
    expect(repo.get(f.card.id)?.bonus_awarded).toBe(10);
    expect(activity.getMember(f.id, 'author')?.points).toBe(10);
    await f.service.handleVote(button(f, 'b'));
    await f.service.handleVote(button(f, 'b'));
    expect(activity.getMember(f.id, 'author')?.points).toBe(10);
  });
  it('copies the replay into its card before removing the original, and keeps downloads and owner controls', async () => {
    const f = archiveFixture();
    expect(await f.service.post(f.source, f.attachment as any, f.fingerprint, f.file)).toBe(true);
    const card = repo.findFingerprint(f.id, f.fingerprint)!;
    expect(card.archive_attachment_id).toBe('600');
    expect(card.description).toBe('Great game');
    expect(f.channel.send.mock.calls[0][0].files[0].attachment).toEqual(f.bytes);
    expect(f.channel.send.mock.calls[0][0].allowedMentions).toEqual({
      parse: [],
      repliedUser: false,
    });
    const payload = f.sent.edit.mock.calls.at(-1)![0];
    expect(payload.embeds).toEqual([]);
    expect(payload.flags).toBe(MessageFlags.IsComponentsV2);
    expect(payload.components).toHaveLength(2);
    const container = payload.components[0].toJSON();
    expect(container.type).toBe(17);
    expect(container.components.find((c: any) => c.type === 13).file.url).toBe(
      `attachment://${card.filename}`,
    );
    expect(container.components.some((c: any) => c.type === 1)).toBe(false);
    const rows = payload.components.slice(1).map((row: any) => row.toJSON());
    expect(JSON.stringify(payload.components)).not.toContain('replay_manage:');
    expect(JSON.stringify(payload.components)).toContain(`replay_options:${card.id}`);
    expect(rows[0].components[0].custom_id).toBe(`replay_vote:up:${card.id}`);
    expect(container.components.at(-1).content).toBe(`-# Replay #${card.id}`);
    expect(f.sent.react).not.toHaveBeenCalled();
    expect(f.source.delete).toHaveBeenCalledOnce();
    expect(f.source.delete.mock.invocationCallOrder[0]).toBeGreaterThan(
      f.sent.edit.mock.invocationCallOrder[0],
    );
    expect(f.source.edit).not.toHaveBeenCalled();
    expect(await f.service.post(f.source, f.attachment as any, f.fingerprint, f.file)).toBe(false);
    expect(f.channel.send).toHaveBeenCalledOnce();
  });
  it('upgrades an existing legacy card instead of duplicating it', async () => {
    const f = archiveFixture();
    const pending = repo.create({
      guild_id: f.id,
      user_id: 'author',
      channel_id: f.channelId,
      source_message_id: f.source.id,
      attachment_id: f.attachment.id,
      filename: f.attachment.name,
      fingerprint: f.fingerprint,
    });
    repo.attachMessage(pending.id, f.sent.id);
    f.sent.attachments = new Collection();
    expect(await f.service.post(f.source, f.attachment as any, f.fingerprint, f.file)).toBe(false);
    expect(f.channel.send).not.toHaveBeenCalled();
    expect(f.sent.edit.mock.calls[0][0].files[0].attachment).toEqual(f.bytes);
    expect(repo.get(pending.id)?.archive_attachment_id).toBe('600');
    expect(f.source.delete).toHaveBeenCalledOnce();
  });
  it('waits until every replay in a multi-file upload has a verified archive before deletion', async () => {
    const f = archiveFixture();
    const second = { ...f.attachment, id: '501', name: 'second.RA3Replay' };
    f.source.attachments.set(second.id, second);
    await f.service.post(f.source, f.attachment as any, f.fingerprint, f.file);
    expect(f.source.delete).not.toHaveBeenCalled();
    const card = repo.create({
      guild_id: f.id,
      user_id: 'author',
      channel_id: f.channelId,
      source_message_id: f.source.id,
      attachment_id: second.id,
      fingerprint: 'e'.repeat(64),
      filename: second.name,
    });
    repo.attachMessage(card.id, 'second-card');
    repo.archive(card.id, '601', f.source.content);
    const copy = {
      ...f.sent,
      id: 'second-card',
      attachments: new Collection([['601', { ...second, id: '601' }]]),
    };
    f.fetch.mockImplementation(async (id) => (id === 'second-card' ? copy : f.sent));
    expect(await f.service.hideSource(f.source)).toBe(true);
    expect(f.source.delete).toHaveBeenCalledOnce();
  });
  it('recovers a successful send after a crash without creating a second card', async () => {
    const f = archiveFixture();
    const pending = repo.create({
      guild_id: f.id,
      user_id: 'author',
      channel_id: f.channelId,
      source_message_id: f.source.id,
      attachment_id: f.attachment.id,
      filename: f.attachment.name,
      fingerprint: f.fingerprint,
    });
    f.sent.embeds = [{ footer: { text: `Replay #${pending.id} - rules` } }];
    f.fetch.mockImplementation(async (arg) =>
      typeof arg === 'string' ? f.sent : new Collection([[f.sent.id, f.sent]]),
    );
    expect(await f.service.post(f.source, f.attachment as any, f.fingerprint, f.file)).toBe(false);
    expect(repo.get(pending.id)?.card_message_id).toBe(f.sent.id);
    expect(f.channel.send).not.toHaveBeenCalled();
    expect(f.source.delete).toHaveBeenCalledOnce();
  });
  it('recovers a single-container card after a crash without sending a duplicate', async () => {
    const f = archiveFixture();
    const pending = repo.create({
      guild_id: f.id,
      user_id: 'author',
      channel_id: f.channelId,
      source_message_id: f.source.id,
      attachment_id: f.attachment.id,
      filename: f.attachment.name,
      fingerprint: f.fingerprint,
    });
    f.sent.components = [
      {
        toJSON: () => ({
          type: 17,
          components: [{ type: 1, components: [{ custom_id: `replay_vote:up:${pending.id}` }] }],
        }),
      },
    ];
    f.fetch.mockImplementation(async (arg) =>
      typeof arg === 'string' ? f.sent : new Collection([[f.sent.id, f.sent]]),
    );
    await f.service.post(f.source, f.attachment as any, f.fingerprint, f.file);
    expect(f.channel.send).not.toHaveBeenCalled();
    expect(repo.get(pending.id)?.card_message_id).toBe(f.sent.id);
    expect(f.source.delete).toHaveBeenCalledOnce();
  });
  it.each(['failed-copy', 'missing-copy', 'other-file', 'missing-permission', 'disabled-scan'])(
    'preserves the original upload when archiving is unsafe: %s',
    async (reason) => {
      const f = archiveFixture();
      if (reason === 'failed-copy') f.channel.send.mockRejectedValue(new Error('upload failed'));
      if (reason === 'missing-copy') {
        f.sent.attachments = new Collection();
        f.sent.edit.mockResolvedValue(f.sent);
      }
      if (reason === 'other-file')
        f.source.attachments.set('extra', { ...f.attachment, id: 'extra', name: 'notes.txt' });
      if (reason === 'missing-permission')
        Object.defineProperty(f.channel, 'permissionsFor', {
          value: () => ({ has: (p: any) => Array.isArray(p) }),
        });
      if (reason === 'disabled-scan') activity.updateSettings(f.id, { replayAutoScan: false }, 0);
      await f.service.post(f.source, f.attachment as any, f.fingerprint, f.file);
      expect(f.source.delete).not.toHaveBeenCalled();
    },
  );
  it('does not let recovery assign an already credited replay to another uploader', async () => {
    const f = fixture();
    const fingerprint = '9'.repeat(64);
    activity.recordActivity({
      guildId: f.id,
      userId: 'original',
      activityDate: new Date().toISOString().slice(0, 10),
      hasCncPing: false,
      replayFingerprints: [fingerprint],
    });
    const source: any = { guild: f.guild, channelId: f.channelId, author: { id: 'copy' } };
    expect(await f.service.post(source, { id: 'copy' } as any, fingerprint)).toBe(false);
    expect(repo.findFingerprint(f.id, fingerprint)).toBeUndefined();
  });
});
