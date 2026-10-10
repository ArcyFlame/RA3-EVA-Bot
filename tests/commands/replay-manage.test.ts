import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Collection } from 'discord.js';
import { connectDatabase } from '../../src/database/connection';
import { guildRepository } from '../../src/repositories/guild.repository';
import { replayRatingRepository as repo } from '../../src/repositories/replay-rating.repository';
import { activityRankRepository as activity } from '../../src/repositories/activity-rank.repository';
import { manageReplay } from '../../src/commands/replays/replay-manage.view';
import { activityRankService, replayFingerprint } from '../../src/services/activity-rank.service';
import { replayRatingService } from '../../src/services/replay-rating.service';
beforeAll(connectDatabase);
beforeEach(() => {
  vi.restoreAllMocks();
});
const author = '222222222222222222',
  other = '333333333333333333';
let sequence = 0;
function fixture(action = 'edit', actor = author, moderator = false) {
  const guildId = `replay-manage-${++sequence}`,
    messageId = `card-${sequence}`;
  guildRepository.upsert(guildId, { game: 'genevo', activityRanksEnabled: 1 });
  activity.updateSettings(guildId, { ratingMinVotes: 1 }, 0);
  const card = repo.create({
    guild_id: guildId,
    user_id: author,
    channel_id: '1321748469735620640',
    source_message_id: 'upload',
    attachment_id: 'file',
    fingerprint: sequence.toString(16).padStart(64, '0'),
    filename: 'test.RA3Replay',
  });
  repo.attachMessage(card.id, messageId);
  repo.archive(card.id, 'copy-file', 'old description');
  const member = {
    id: actor,
    user: { id: actor },
    guild: { id: guildId, ownerId: 'else' },
    permissions: { has: () => moderator },
    roles: { cache: new Collection() },
  };
  const message: any = {
    id: messageId,
    author: { id: 'bot' },
    edit: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(null),
  };
  const channel: any = { messages: { fetch: vi.fn().mockResolvedValue(message) } };
  const guild: any = {
    id: guildId,
    members: { fetch: vi.fn().mockResolvedValue(member) },
    channels: { fetch: vi.fn().mockResolvedValue(channel) },
  };
  const i: any = {
    guildId,
    guild,
    user: { id: actor },
    client: { user: { id: 'bot' } },
    message,
    customId: `replay_manage:${action}:${card.id}:0${['save', 'confirm'].includes(action) ? ':' + actor : ''}`,
    reply: vi.fn(),
    showModal: vi.fn(),
    deferReply: vi.fn(),
    editReply: vi.fn(),
    isButton: () => action !== 'save',
    isModalSubmit: () => action === 'save',
    fields: {
      getTextInputValue: () => 'corrected description',
      getUploadedFiles: () => new Collection(),
    },
  };
  return { i, card, message, guild, channel, member, guildId };
}
describe('uploader-owned replay controls', () => {
  it('opens an owner-bound native file replacement modal', async () => {
    const f = fixture();
    await manageReplay(f.i);
    const modal = f.i.showModal.mock.calls[0][0].toJSON();
    expect(modal.custom_id).toBe(`replay_manage:save:${f.card.id}:0:${author}`);
    expect(modal.components[1].component.type).toBe(19);
    expect(f.message.edit).not.toHaveBeenCalled();
  });
  it.each(['edit', 'save', 'remove', 'confirm'])('rejects other members for %s', async (action) => {
    const f = fixture(action, other);
    await manageReplay(f.i);
    expect(f.i.reply.mock.calls[0][0].ephemeral).toBe(true);
    expect(f.i.deferReply).not.toHaveBeenCalled();
    expect(f.message.delete).not.toHaveBeenCalled();
    expect(f.message.edit).not.toHaveBeenCalled();
  });
  it('allows moderators to remove but never edit another uploader replay', async () => {
    const f = fixture('remove', other, true);
    await manageReplay(f.i);
    const response = f.i.reply.mock.calls[0][0];
    expect(response.ephemeral).toBe(true);
    expect(response.components[0].toJSON().components[0].custom_id).toContain(
      `:confirm:${f.card.id}:0:${other}`,
    );
    f.i.customId = `replay_manage:edit:${f.card.id}:0`;
    await manageReplay(f.i);
    expect(f.i.showModal).not.toHaveBeenCalled();
  });
  it('edits description without resetting votes or adding XP and advances the card revision', async () => {
    const f = fixture('save');
    repo.vote(f.card.id, other, 1);
    const points = activity.getMember(f.guildId, author)?.points;
    await manageReplay(f.i);
    expect(repo.get(f.card.id)).toMatchObject({
      description: 'corrected description',
      revision: 1,
      bonus_awarded: 5,
    });
    expect(repo.totals(f.card.id).up).toBe(1);
    expect(activity.getMember(f.guildId, author)?.points).toBe(points);
    expect(f.i.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(f.message.edit).toHaveBeenCalledOnce();
    await manageReplay(f.i);
    expect(f.message.edit).toHaveBeenCalledOnce();
  });
  it('confirms removal privately and closes the fingerprint without refunding or re-awarding XP', async () => {
    const f = fixture('confirm');
    repo.vote(f.card.id, other, 1);
    await manageReplay(f.i);
    expect(f.message.delete).toHaveBeenCalledOnce();
    expect(repo.get(f.card.id)?.closed).toBe(1);
    expect(activity.getMember(f.guildId, author)?.points).toBe(5);
    expect(repo.vote(f.card.id, 'next-voter', 1)).toBe(0);
    expect(f.i.deferReply).toHaveBeenCalledWith({ ephemeral: true });
  });
  it.each([
    'wrong-guild',
    'stale-revision',
    'wrong-owner-modal',
    'deleted-card',
    'not-bot-message',
  ])('rejects mismatched or stale controls: %s', async (reason) => {
    const f = fixture('save');
    if (reason === 'wrong-guild') f.i.guildId = 'other-guild';
    if (reason === 'stale-revision') repo.editDescription(f.card.id, 'changed', 0);
    if (reason === 'wrong-owner-modal') f.i.customId = `replay_manage:save:${f.card.id}:0:${other}`;
    if (reason === 'deleted-card') repo.closeMessage(f.message.id);
    if (reason === 'not-bot-message') f.message.author.id = 'not-bot';
    await manageReplay(f.i);
    expect(f.message.edit).not.toHaveBeenCalled();
    expect(f.message.delete).not.toHaveBeenCalled();
  });
  it('rechecks a card changed during the Discord message fetch', async () => {
    const f = fixture('save');
    f.channel.messages.fetch.mockImplementation(async () => {
      repo.editDescription(f.card.id, 'another edit', 0);
      return f.message;
    });
    await manageReplay(f.i);
    expect(f.message.edit).not.toHaveBeenCalled();
    expect(f.i.editReply.mock.calls[0][0].content).toContain('changed');
  });
  it.each([true, false])(
    'deletes the old replay only if replacement archiving succeeds: %s',
    async (success) => {
      const f = fixture('save');
      const bytes = Buffer.alloc(256);
      bytes.write('RA3 REPLAY HEADER');
      bytes[17] = 5;
      const file = { bytes, fingerprint: replayFingerprint(bytes)! };
      vi.spyOn(activityRankService, 'downloadReplayFile').mockResolvedValue(file);
      const post = vi.spyOn(replayRatingService, 'post').mockResolvedValue(success);
      f.i.fields.getUploadedFiles = () =>
        new Collection([['replacement', { id: 'new-file', name: 'replacement.RA3Replay' }]]);
      await manageReplay(f.i);
      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({ author: f.member.user, content: 'corrected description' }),
        expect.anything(),
        file.fingerprint,
        file,
      );
      expect(f.message.delete).toHaveBeenCalledTimes(success ? 1 : 0);
      expect(repo.get(f.card.id)?.closed).toBe(success ? 1 : 0);
      expect(activity.getMember(f.guildId, author)).toBeUndefined();
      if (success)
        expect(f.message.delete.mock.invocationCallOrder[0]).toBeGreaterThan(
          post.mock.invocationCallOrder[0],
        );
    },
  );
  it('does not allow reposting a known fingerprint through replacement to farm fresh votes', async () => {
    const f = fixture('save');
    vi.spyOn(activityRankService, 'downloadReplayFile').mockResolvedValue({
      bytes: Buffer.alloc(256),
      fingerprint: f.card.fingerprint,
    });
    const post = vi.spyOn(replayRatingService, 'post');
    f.i.fields.getUploadedFiles = () =>
      new Collection([['replacement', { name: 'test.RA3Replay' }]]);
    await manageReplay(f.i);
    expect(post).not.toHaveBeenCalled();
    expect(f.message.delete).not.toHaveBeenCalled();
    expect(f.i.editReply.mock.calls[0][0].content).toContain('already has a card');
  });
});
