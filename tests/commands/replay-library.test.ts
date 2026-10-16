import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Collection, MessageFlags } from 'discord.js';
import { connectDatabase } from '../../src/database/connection';
import { guildRepository } from '../../src/repositories/guild.repository';
import { replayRatingRepository as repo } from '../../src/repositories/replay-rating.repository';
import { appSettingsRepository } from '../../src/repositories/app-settings.repository';
import {
  replayLibraryView,
  selectReplay,
  navigateReplayLibrary,
  openReplayOptions,
} from '../../src/commands/replays/replay-library.view';
import { manageReplayMedals } from '../../src/commands/replays/replay-medals.view';
import { manageReplay } from '../../src/commands/replays/replay-manage.view';

beforeAll(connectDatabase);
let seq = 0;
const author = '222222222222222222',
  other = '333333333333333333';
function fixture(actor = author, admin = false) {
  const guildId = `private-replay-${++seq}`,
    channelId = '1321748469735620640';
  guildRepository.upsert(guildId, { game: 'genevo' });
  const member: any = {
    id: actor,
    guild: { id: guildId, ownerId: 'owner' },
    user: { id: actor },
    roles: { cache: new Collection() },
    permissions: { has: () => admin },
  };
  const channel: any = {
    id: channelId,
    guildId,
    isTextBased: () => true,
    permissionsFor: () => ({ has: () => true }),
  };
  const guild: any = {
    id: guildId,
    channels: { fetch: vi.fn().mockResolvedValue(channel) },
    members: { fetch: vi.fn().mockResolvedValue(member) },
  };
  const card = repo.create({
    guild_id: guildId,
    channel_id: channelId,
    user_id: author,
    source_message_id: `source${seq}`,
    attachment_id: `file${seq}`,
    fingerprint: seq.toString(16).padStart(64, '0'),
    filename: 'game.RA3Replay',
  });
  repo.attachMessage(card.id, `message${seq}`);
  repo.archive(card.id, `copy${seq}`, '');
  const interaction: any = {
    guild,
    guildId,
    channelId,
    client: { user: { id: 'bot' } },
    user: { id: actor },
    customId: `replay_select:${actor}`,
    values: [String(card.id)],
    message: {
      id: 'private-menu',
      author: { id: 'bot' },
      flags: { has: (flag: number) => flag === MessageFlags.Ephemeral },
    },
    reply: vi.fn(),
    deferUpdate: vi.fn(),
    deferReply: vi.fn(),
    editReply: vi.fn(),
    showModal: vi.fn(),
    isButton: () => true,
    fields: {
      getTextInputValue: (name: string) =>
        ({ bronze: '10', silver: '20', gold: '30', diamond: '40' })[name],
    },
  };
  return {
    interaction,
    member,
    channel,
    card: repo.get(card.id)!,
    access: { guildId, channelId, member },
  };
}
describe('private replay controls', () => {
  it.each([false, true])(
    'opens private options directly from the card for owner/staff (%s)',
    async (admin) => {
      const f = fixture(admin ? other : author, admin);
      f.interaction.customId = `replay_options:${f.card.id}`;
      f.interaction.message.id = f.card.card_message_id;
      f.interaction.message.flags.has = () => false;
      await openReplayOptions(f.interaction);
      expect(f.interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
      const payload = f.interaction.editReply.mock.calls[0][0];
      expect(JSON.stringify(payload)).toContain('Edit Replay');
      expect(JSON.stringify(payload)).toContain('Remove Replay');
      f.interaction.message.id = 'private-options';
      f.interaction.message.flags.has = (flag: number) => flag === MessageFlags.Ephemeral;
      f.interaction.customId = payload.components[0].toJSON().components[0].custom_id;
      await manageReplay(f.interaction);
      expect(f.interaction.showModal).toHaveBeenCalledOnce();
    },
  );
  it.each([
    'other-owner',
    'wrong-channel',
    'copied-message',
    'wrong-author',
    'closed',
    'lost-channel-access',
  ])('does not expose management from public options: %s', async (reason) => {
    const f = fixture(reason === 'other-owner' ? other : author);
    f.interaction.customId = `replay_options:${f.card.id}`;
    f.interaction.message.id = f.card.card_message_id;
    if (reason === 'wrong-channel') f.interaction.channelId = 'other-channel';
    if (reason === 'copied-message') f.interaction.message.id = 'copy';
    if (reason === 'wrong-author') f.interaction.message.author.id = 'other-bot';
    if (reason === 'closed') repo.closeMessage(f.card.card_message_id!);
    if (reason === 'lost-channel-access') f.channel.permissionsFor = () => ({ has: () => false });
    await openReplayOptions(f.interaction);
    expect(f.interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(JSON.stringify(f.interaction.editReply.mock.calls)).not.toContain('replay_manage:');
  });
  it('shows only personal navigation to ordinary members and staff management to admins', () => {
    const normal = fixture();
    const own = JSON.stringify(replayLibraryView(normal.access));
    expect(own).toContain('My Replays');
    expect(own).not.toContain('Manage Server Replays');
    expect(own).not.toContain('Medal Settings');
    const admin = fixture(other, true);
    const staff = JSON.stringify(replayLibraryView(admin.access));
    expect(staff).toContain('Manage Server Replays');
    expect(staff).not.toContain('Medal Settings');
  });
  it.each([false, true])(
    'opens private edit controls for owner/admin (admin: %s)',
    async (admin) => {
      const f = fixture(admin ? other : author, admin);
      await selectReplay(f.interaction);
      const payload = f.interaction.editReply.mock.calls[0][0];
      expect(JSON.stringify(payload)).toContain('Edit Replay');
      f.interaction.customId = payload.components[0].toJSON().components[0].custom_id;
      await manageReplay(f.interaction);
      expect(f.interaction.showModal).toHaveBeenCalledOnce();
    },
  );
  it.each(['other-owner', 'wrong-guild', 'public', 'wrong-actor', 'lost-channel-access'])(
    'refuses private control access: %s',
    async (reason) => {
      const f = fixture(reason === 'other-owner' ? other : author);
      if (reason === 'wrong-guild') repo.create({ ...f.card, guild_id: 'other' });
      if (reason === 'wrong-guild') f.interaction.guild.id = 'other';
      if (reason === 'public') f.interaction.message.flags.has = () => false;
      if (reason === 'wrong-actor') f.interaction.customId = `replay_select:${other}`;
      if (reason === 'lost-channel-access') f.channel.permissionsFor = () => ({ has: () => false });
      await selectReplay(f.interaction);
      expect(JSON.stringify(f.interaction.editReply.mock.calls)).not.toContain('replay_manage:');
      expect(f.interaction.showModal).not.toHaveBeenCalled();
    },
  );
  it('does not let a regular member navigate into the staff library', async () => {
    const f = fixture();
    f.interaction.customId = `replay_library:all:0:${author}`;
    await navigateReplayLibrary(f.interaction);
    expect(f.interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ components: [] }),
    );
  });
});
describe('admin-only medal settings', () => {
  it('rejects ordinary users and rechecks roles on submit', async () => {
    const f = fixture();
    f.interaction.customId = `replay_medals:${author}`;
    await manageReplayMedals(f.interaction);
    expect(f.interaction.showModal).not.toHaveBeenCalled();
    f.interaction.isButton = () => false;
    await manageReplayMedals(f.interaction);
    expect(appSettingsRepository.getReplayMedals(f.access.guildId).bronze).toBe(5);
  });
  it('lets an admin edit four separate thresholds for this server only', async () => {
    const f = fixture(author, true);
    f.interaction.customId = `replay_medals:${author}`;
    await manageReplayMedals(f.interaction);
    expect(f.interaction.showModal.mock.calls[0][0].toJSON().components).toHaveLength(4);
    f.interaction.isButton = () => false;
    await manageReplayMedals(f.interaction);
    expect(appSettingsRepository.getReplayMedals(f.access.guildId)).toEqual({
      bronze: 10,
      silver: 20,
      gold: 30,
      diamond: 40,
    });
    expect(appSettingsRepository.getReplayMedals('unrelated').bronze).toBe(5);
  });
});
