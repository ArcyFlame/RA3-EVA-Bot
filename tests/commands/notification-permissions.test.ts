import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Collection, Guild } from 'discord.js';
import { connectDatabase } from '../../src/database/connection';
import { guildRepository } from '../../src/repositories/guild.repository';
import { statsPanelRepository } from '../../src/repositories/stats-panel.repository';
import { trackedStreamerRepository } from '../../src/repositories/tracked-streamer.repository';
import { GuildChannelsWizardView, wizardViews } from '../../src/commands/notifications/views';
import { execute as clear } from '../../src/interactions/buttons/global-clear-channel.button';
import { execute as clearAll } from '../../src/interactions/buttons/global-clear-all.button';
import { execute as legacyClearAll } from '../../src/interactions/buttons/clear-all-channels.button';
import { execute as set } from '../../src/interactions/selectMenus/set-global-channel.select';
import { execute as openSet } from '../../src/interactions/buttons/global-set-channel.button';
import { execute as select } from '../../src/interactions/selectMenus/global-channel-select.select';
import { execute as removeStreamer } from '../../src/interactions/selectMenus/remove-streamer-select.select';
import { execute as addStreamer } from '../../src/interactions/modals/add-streamer.modal';
import { execute as openStreamer } from '../../src/interactions/buttons/add-streamer.button';
import { twitchService } from '../../src/services/twitch.service';
import { postRecentIfChannelEmpty } from '../../src/services/content-bootstrap.service';

vi.mock('../../src/services/content-bootstrap.service', () => ({
  postRecentIfChannelEmpty: vi.fn().mockResolvedValue('empty'),
}));

let sequence = 0;
beforeAll(connectDatabase);
beforeEach(() => {
  vi.restoreAllMocks();
  wizardViews.clear();
  vi.clearAllMocks();
});

function fixture(admin = true) {
  const id = 'notification-' + ++sequence;
  guildRepository.upsert(id, {
    adminRoleId: 'staff',
    newsChannelId: 'old-news',
    clanChannelId: 'old-clan',
  });
  guildRepository.updateNotifyChannel(id, 'news', 'old-news');
  const current = {
    id: 'operator',
    guild: { id, ownerId: 'other' },
    permissions: { has: () => false },
    roles: { cache: new Collection(admin ? [['staff', {}]] : []) },
  };
  const channel = {
    id: 'chosen',
    guildId: id,
    type: 0,
    toString: () => '<#chosen>',
    isTextBased: () => true,
    messages: { delete: vi.fn().mockResolvedValue(undefined) },
  };
  const guild = {
    id,
    members: { fetch: vi.fn().mockResolvedValue(current) },
    channels: { fetch: vi.fn().mockResolvedValue(channel), cache: new Collection() },
  } as unknown as Guild;
  const view = new GuildChannelsWizardView(guild, 'operator');
  const interaction: any = {
    guild,
    guildId: id,
    user: { id: 'operator' },
    message: { id: 'parent' },
    values: ['news'],
    customId: 'set_global_channel_news',
    reply: vi.fn(),
    followUp: vi.fn(),
    editReply: vi.fn().mockResolvedValue({ id: 'child' }),
    showModal: vi.fn(),
    fields: {
      getTextInputValue: (field: string) => (field === 'platform' ? 'twitch' : 'streamer'),
    },
    deferReply: vi.fn(async () => {
      interaction.deferred = true;
    }),
    deferUpdate: vi.fn(async () => {
      interaction.deferred = true;
    }),
  };
  wizardViews.set('parent', view);
  wizardViews.set('child', view);
  return { id, current, guild, view, interaction, channel, bot: { client: {} } as any };
}

describe('notification manager authorization', () => {
  it.each([
    ['clear', clear],
    ['clear all', clearAll],
    ['legacy clear all', legacyClearAll],
    ['set channel', set],
    ['open picker', openSet],
    ['select category', select],
  ] as const)('rejects revoked administrators through %s', async (_, handler) => {
    const f = fixture(false);
    await handler(f.bot, f.interaction);
    expect(f.guild.members.fetch).toHaveBeenCalledWith({ user: 'operator', force: true });
    expect(guildRepository.findByDiscordId(f.id)).toMatchObject({
      newsChannelId: 'old-news',
      clanChannelId: 'old-clan',
    });
    expect(postRecentIfChannelEmpty).not.toHaveBeenCalled();
    expect(wizardViews.size).toBe(0);
    expect(f.interaction.followUp.mock.calls[0][0].ephemeral).toBe(true);
  });

  it('rejects another owner, another guild, expired sessions and failed membership fetches', async () => {
    for (const mode of ['owner', 'guild', 'expired', 'fetch-failed']) {
      const f = fixture();
      if (mode === 'owner') f.interaction.user.id = 'outsider';
      if (mode === 'guild') f.interaction.guild = { ...f.guild, id: 'foreign' };
      if (mode === 'expired') wizardViews.delete('parent');
      if (mode === 'fetch-failed')
        vi.mocked(f.guild.members.fetch).mockRejectedValue(new Error('unavailable'));
      await f.view.handleClear(f.interaction);
      expect(guildRepository.findByDiscordId(f.id)?.clanChannelId).toBe('old-clan');
    }
  });

  it('rejects expiry while a fresh permission check is awaiting', async () => {
    const f = fixture();
    vi.mocked(f.guild.members.fetch).mockImplementation(async () => {
      wizardViews.delete('parent');
      return f.current as any;
    });
    await f.view.handleClear(f.interaction);
    expect(guildRepository.findByDiscordId(f.id)?.clanChannelId).toBe('old-clan');
  });

  it('rechecks privileges after fetching a selected channel', async () => {
    const f = fixture();
    f.interaction.values = ['chosen'];
    vi.mocked(f.guild.channels.fetch).mockImplementation(async () => {
      f.current.roles.cache.clear();
      return f.channel as any;
    });
    await set(f.bot, f.interaction);
    expect(guildRepository.findByDiscordId(f.id)?.newsChannelId).toBe('old-news');
    expect(postRecentIfChannelEmpty).not.toHaveBeenCalled();
  });

  it('rechecks privileges before deleting a stats message and clearing any channels', async () => {
    const f = fixture();
    statsPanelRepository.setPanel(f.id, 'chosen', 'panel');
    vi.mocked(f.guild.channels.fetch).mockImplementation(async () => {
      f.current.roles.cache.clear();
      return f.channel as any;
    });
    await clearAll(f.bot, f.interaction);
    expect(f.channel.messages.delete).not.toHaveBeenCalled();
    expect(statsPanelRepository.get(f.id)?.messageId).toBe('panel');
    expect(guildRepository.findByDiscordId(f.id)?.newsChannelId).toBe('old-news');
  });

  it('validates category and selected-channel ownership/type before persisting', async () => {
    for (const mode of ['category', 'foreign', 'thread']) {
      const f = fixture();
      f.interaction.values = ['chosen'];
      if (mode === 'category') f.interaction.customId = 'set_global_channel_admin_role_id';
      if (mode === 'foreign') f.channel.guildId = 'other';
      if (mode === 'thread') f.channel.type = 11;
      await set(f.bot, f.interaction);
      expect(guildRepository.findByDiscordId(f.id)?.newsChannelId).toBe('old-news');
      expect(postRecentIfChannelEmpty).not.toHaveBeenCalled();
    }
  });

  it('preserves authorized assignment, bootstrap targeting and stats panel state', async () => {
    const f = fixture();
    f.interaction.values = ['chosen'];
    await set(f.bot, f.interaction);
    expect(guildRepository.findByDiscordId(f.id)?.newsChannelId).toBe('chosen');
    expect(postRecentIfChannelEmpty).toHaveBeenCalledWith(f.bot.client, f.id, 'news', 'chosen');
    const stats = fixture();
    stats.interaction.values = ['chosen'];
    stats.interaction.customId = 'set_global_channel_stats_panel';
    statsPanelRepository.setPanel(stats.id, 'old', 'panel');
    statsPanelRepository.setPageByMessageId('panel', 2);
    await set(stats.bot, stats.interaction);
    expect(statsPanelRepository.get(stats.id)).toMatchObject({
      channelId: 'chosen',
      messageId: 'panel',
      currentPage: 2,
    });
  });

  it.each([clearAll, legacyClearAll])(
    'clears news too, with authorized stats cleanup',
    async (handler) => {
      const f = fixture();
      statsPanelRepository.setPanel(f.id, 'chosen', 'panel');
      await handler(f.bot, f.interaction);
      expect(guildRepository.findByDiscordId(f.id)?.newsChannelId).toBeNull();
      expect(f.channel.messages.delete).toHaveBeenCalledWith('panel');
      expect(statsPanelRepository.get(f.id)).toBeUndefined();
    },
  );

  it('blocks revoked streamer removal and stale add forms, including revocation during provider lookup', async () => {
    const denied = fixture(false);
    trackedStreamerRepository.addStreamer(denied.id, 'twitch', 'stream', 'Streamer');
    denied.interaction.values = ['stream'];
    await removeStreamer(denied.bot, denied.interaction);
    await openStreamer(denied.bot, denied.interaction);
    expect(trackedStreamerRepository.findByGuild(denied.id)).toHaveLength(1);
    expect(denied.interaction.showModal).not.toHaveBeenCalled();
    const f = fixture();
    vi.spyOn(twitchService, 'getUserByLogin').mockImplementation(async () => {
      f.current.roles.cache.clear();
      return { id: 'stream', displayName: 'Streamer' } as any;
    });
    await addStreamer(f.bot, f.interaction);
    expect(trackedStreamerRepository.findByGuild(f.id)).toHaveLength(0);
  });

  it('keeps streamer removal available to a current configured administrator', async () => {
    const f = fixture();
    trackedStreamerRepository.addStreamer(f.id, 'twitch', 'stream', 'Streamer');
    f.interaction.values = ['stream'];
    await removeStreamer(f.bot, f.interaction);
    expect(trackedStreamerRepository.findByGuild(f.id)).toHaveLength(0);
  });
});
