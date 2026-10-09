import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';
import { connectDatabase } from '../../src/database/connection';
import { guildRepository } from '../../src/repositories/guild.repository';
import { activityRankRepository } from '../../src/repositories/activity-rank.repository';
import { execute } from '../../src/commands/info/replays.command';
beforeAll(connectDatabase);
let sequence = 0;
function fixture(game: 'ra3' | 'genevo', visible = true) {
  const id = String(890000000000000000n + BigInt(++sequence));
  const channelId = '1321748469735620640';
  guildRepository.upsert(id, { game });
  activityRankRepository.updateSettings(id, { replayChannelId: channelId }, 0);
  const channel = {
    id: channelId,
    guildId: id,
    isTextBased: () => true,
    permissionsFor: () => ({
      has: (permission: bigint) => visible && permission === PermissionFlagsBits.ViewChannel,
    }),
  };
  const guild = {
    id,
    channels: { fetch: vi.fn().mockResolvedValue(channel) },
    members: { fetch: vi.fn().mockResolvedValue({ id: 'member' }) },
  };
  const interaction: any = {
    guild,
    guildId: id,
    user: { id: 'member' },
    deferReply: vi.fn(),
    editReply: vi.fn(),
    reply: vi.fn(),
  };
  return { interaction, guild, channel };
}
describe('replay resources by setup', () => {
  it('opens the selected GenEvo replay channel instead of ModDB', async () => {
    const { interaction, guild, channel } = fixture('genevo');
    await execute(null as never, interaction);
    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    const payload = interaction.editReply.mock.calls[0][0];
    expect(payload.components[0].toJSON().components[0].url).toBe(
      `https://discord.com/channels/${guild.id}/${channel.id}`,
    );
    expect(JSON.stringify(payload.components)).not.toContain('moddb');
  });
  it.each(['deleted', 'other-server', 'private', 'not-text'])(
    'does not link to a %s replay channel',
    async (kind) => {
      const { interaction, guild, channel } = fixture('genevo', kind !== 'private');
      if (kind === 'deleted') guild.channels.fetch.mockRejectedValue(new Error('Missing channel'));
      if (kind === 'other-server') channel.guildId = 'another-server';
      if (kind === 'not-text') channel.isTextBased = () => false;
      await execute(null as never, interaction);
      const payload = interaction.editReply.mock.calls[0][0];
      expect(payload.components).toEqual([]);
      expect(payload.embeds[0].toJSON().description).toContain('admin');
      expect(JSON.stringify(payload)).not.toContain(channel.id);
    },
  );
  it('keeps RA3 GameReplays links', async () => {
    const { interaction } = fixture('ra3');
    await execute(null as never, interaction);
    expect(interaction.reply.mock.calls[0][0].components[0].toJSON().components).toHaveLength(3);
    expect(JSON.stringify(interaction.reply.mock.calls[0][0])).toContain('gamereplays.org');
  });
});
