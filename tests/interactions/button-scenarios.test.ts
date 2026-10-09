import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Collection, PermissionFlagsBits } from 'discord.js';
import { connectDatabase } from '../../src/database/connection';
import { guildRepository } from '../../src/repositories/guild.repository';
import { userRepository } from '../../src/repositories/user.repository';
import { execute as adminRole } from '../../src/interactions/buttons/setup-admin-role.button';
import { execute as refereeRole } from '../../src/interactions/buttons/setup-referee-role.button';
import { execute as features } from '../../src/interactions/buttons/setup-features.button';
import { execute as notifyChannels } from '../../src/interactions/buttons/setup-notify-channels.button';
import { execute as globalChannels } from '../../src/interactions/buttons/global-channels.button';
import { execute as addStreamer } from '../../src/interactions/buttons/add-streamer.button';
import { execute as removeStreamer } from '../../src/interactions/buttons/remove-streamer.button';
import { execute as trackedStreamers } from '../../src/interactions/buttons/tracked-streamers.button';
import { execute as notificationTest } from '../../src/interactions/buttons/notif-test.button';
import { execute as featureSet } from '../../src/interactions/buttons/feature-set.button';
import { execute as legacyToggle } from '../../src/interactions/buttons/toggle-feature.button';
import { execute as helpCategories } from '../../src/interactions/buttons/feature-help-categories.button';
import { execute as lobbyHelp } from '../../src/interactions/buttons/lobby-help.button';
import { execute as unlink } from '../../src/interactions/buttons/link-remove.button';
import { execute as matchDm } from '../../src/interactions/buttons/toggle-match-dm.button';
import { execute as clanDm } from '../../src/interactions/buttons/toggle-clan-dm.button';
import { execute as statsNav } from '../../src/interactions/buttons/stats-nav.button';
import { execute as eventPage } from '../../src/interactions/buttons/event-page.button';
import { execute as checkin } from '../../src/interactions/buttons/checkin.button';
import { execute as routeInteraction } from '../../src/events/interactionCreate';
import { createRegistry, registerComponent } from '../../src/types';

beforeAll(connectDatabase);
let sequence = 0;
function fixture(admin = false, game: 'ra3' | 'genevo' = 'ra3') {
  const guildId = String(880000000000000000n + BigInt(++sequence));
  const userId = String(770000000000000000n + BigInt(sequence));
  guildRepository.upsert(guildId, { game, adminRoleId: 'configured-admin', tournamentsEnabled: 1 });
  const current = {
    id: userId,
    guild: { id: guildId, ownerId: 'other' },
    permissions: { has: (bit: bigint) => admin && bit === PermissionFlagsBits.Administrator },
    roles: { cache: new Collection() },
  };
  const guild = { id: guildId, members: { fetch: vi.fn().mockResolvedValue(current) } };
  const interaction: any = {
    guildId,
    guild,
    user: { id: userId, username: 'Test Player' },
    message: { id: `test-${sequence}` },
    customId: 'invalid',
    values: [],
    reply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    showModal: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn(async () => {
      interaction.deferred = true;
    }),
    deferUpdate: vi.fn(async () => {
      interaction.deferred = true;
    }),
    isChatInputCommand: () => false,
    isAutocomplete: () => false,
    isButton: () => true,
    isAnySelectMenu: () => false,
    isModalSubmit: () => false,
  };
  return { interaction, guildId, userId, current, bot: { client: {} } as any };
}

describe('button access and response scenarios', () => {
  it.each([
    ['setup admin role', adminRole],
    ['setup referee role', refereeRole],
    ['feature setup', features],
    ['notification setup', notifyChannels],
    ['channel manager', globalChannels],
    ['add streamer', addStreamer],
    ['remove streamer', removeStreamer],
    ['tracked streamers', trackedStreamers],
    ['test posts', notificationTest],
    ['feature state', featureSet],
    ['legacy toggle', legacyToggle],
    ['help categories', helpCategories],
  ] as const)(
    'denies regular members access to %s without opening a form or updating state',
    async (_name, handler) => {
      const f = fixture();
      const before = guildRepository.findByDiscordId(f.guildId);
      await handler(f.bot, f.interaction);
      const denials = [...f.interaction.reply.mock.calls, ...f.interaction.followUp.mock.calls];
      expect(denials.some(([payload]) => payload.ephemeral === true)).toBe(true);
      expect(f.interaction.showModal).not.toHaveBeenCalled();
      expect(f.interaction.update).not.toHaveBeenCalled();
      expect(guildRepository.findByDiscordId(f.guildId)).toEqual(before);
    },
  );

  it.each([
    ['admin', adminRole],
    ['referee', refereeRole],
  ] as const)(
    'lets a Discord administrator open the %s role picker privately',
    async (_name, handler) => {
      const f = fixture(true);
      await handler(f.bot, f.interaction);
      expect(f.interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
      const payload = f.interaction.editReply.mock.calls[0][0];
      expect(payload.components[0].toJSON().components[0].type).toBe(6);
    },
  );

  it('enables and disables a feature through the real handler', async () => {
    const f = fixture(true);
    for (const [action, value] of [
      ['disable', 0],
      ['enable', 1],
    ] as const) {
      f.interaction.customId = `feature_set_${action}_tournaments`;
      await featureSet(f.bot, f.interaction);
      expect(guildRepository.findByDiscordId(f.guildId)?.tournamentsEnabled).toBe(value);
      expect(f.interaction.update).toHaveBeenCalled();
    }
  });

  it('keeps the global DM toggle restricted to the bot owner', async () => {
    const f = fixture(true);
    f.interaction.customId = 'feature_set_disable_dmPublicCommands';
    await featureSet(f.bot, f.interaction);
    expect(f.interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('bot owner'), ephemeral: true }),
    );
    expect(f.interaction.update).not.toHaveBeenCalled();
  });

  it.each(['ra3', 'genevo'] as const)(
    'renders private %s lobby help with valid embeds',
    async (game) => {
      const f = fixture(false, game);
      await lobbyHelp(f.bot, f.interaction);
      const payload = f.interaction.reply.mock.calls[0][0];
      expect(payload.ephemeral).toBe(true);
      expect(payload.embeds[0].toJSON().title).toContain(
        game === 'ra3' ? 'Red Alert 3' : 'Generals Evolution',
      );
    },
  );

  it.each([
    ['match', matchDm, 'tournamentMatchDmEnabled'],
    ['clan', clanDm, 'clanInviteDmEnabled'],
  ] as const)(
    'toggles only the invoking player’s %s notification setting',
    async (_name, handler, property) => {
      const f = fixture();
      userRepository.upsertFromMember(f.userId, 'Test Player');
      const before = userRepository.findByDiscordId(f.userId)![property];
      await handler(f.bot, f.interaction);
      expect(userRepository.findByDiscordId(f.userId)![property]).toBe(before === 1 ? 0 : 1);
      expect(f.interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
      expect(f.interaction.editReply).toHaveBeenCalled();
    },
  );

  it('rejects an unknown linking platform without modifying the player', async () => {
    const f = fixture();
    userRepository.upsertFromMember(f.userId, 'Test Player');
    const before = userRepository.findByDiscordId(f.userId);
    f.interaction.customId = 'link_remove_unknown';
    await unlink(f.bot, f.interaction);
    expect(userRepository.findByDiscordId(f.userId)).toEqual(before);
    expect(f.interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });

  it.each([
    ['stats_nav_delete_0_0', statsNav],
    ['stats_nav_next_-1_0', statsNav],
    ['stats_nav_next_NaN_0', statsNav],
    ['eventpg_delete_1', eventPage],
    ['eventpg_next_invalid', eventPage],
    ['checkin_delete_1', checkin],
    ['checkin_yes_invalid', checkin],
  ] as const)('rejects malformed control %s before any provider operation', async (id, handler) => {
    const f = fixture();
    f.interaction.customId = id;
    await handler(f.bot, f.interaction);
    expect(f.interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Invalid button.', ephemeral: true }),
    );
    expect(f.interaction.update).not.toHaveBeenCalled();
  });

  it('the real interaction router throttles repeated clicks and rejects stale buttons privately', async () => {
    const f = fixture();
    const execute = vi.fn();
    const buttons = createRegistry<any>();
    registerComponent(buttons, { customId: 'fixture_button', execute });
    const bot = {
      components: { buttons, modals: createRegistry(), selectMenus: createRegistry() },
    } as any;
    f.interaction.customId = 'fixture_button';
    await routeInteraction(bot, f.interaction);
    await routeInteraction(bot, f.interaction);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(f.interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: '⏳ Please slow down.', ephemeral: true }),
    );
    f.interaction.customId = 'stale_fixture_button';
    await routeInteraction(bot, f.interaction);
    expect(f.interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '❌ This component is no longer active.',
        ephemeral: true,
      }),
    );
  });

  it('the router blocks tournament components when the guild feature is off', async () => {
    const f = fixture();
    guildRepository.toggleFeature(f.guildId, 'tournaments', false);
    const execute = vi.fn();
    const buttons = createRegistry<any>();
    registerComponent(buttons, { customIdPrefix: 'eventpg_', execute });
    f.interaction.customId = 'eventpg_next_1';
    await routeInteraction({ components: { buttons } } as any, f.interaction);
    expect(execute).not.toHaveBeenCalled();
    expect(f.interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });
});
