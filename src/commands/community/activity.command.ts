import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
  escapeMarkdown,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { activityRankRepository } from '../../repositories/activity-rank.repository';
import { guildRepository } from '../../repositories/guild.repository';
import {
  activityRankService,
  rankForPoints,
  validateActivityRole,
} from '../../services/activity-rank.service';
import { isModerator } from '../../utils/permissions';
import { audit } from '../../utils/logger';

export const data = new SlashCommandBuilder()
  .setName('activity')
  .setDescription('Private activity leaderboard and staff rank tools')
  .addSubcommand((sub) =>
    sub.setName('leaderboard').setDescription('Privately view the server activity leaderboard'),
  )
  .addSubcommand((sub) =>
    sub
      .setName('xp')
      .setDescription('[Staff] Add or remove member XP')
      .addUserOption((o) => o.setName('member').setDescription('Server member').setRequired(true))
      .addIntegerOption((o) =>
        o
          .setName('amount')
          .setDescription('Positive to add, negative to remove XP')
          .setRequired(true)
          .setMinValue(-1000000)
          .setMaxValue(1000000),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('role')
      .setDescription('[Staff] Set, remove or restore an automatic rank role')
      .addUserOption((o) => o.setName('member').setDescription('Server member').setRequired(true))
      .addStringOption((o) =>
        o
          .setName('action')
          .setDescription('Rank role action')
          .setRequired(true)
          .addChoices(
            { name: 'Add configured rank role', value: 'add' },
            { name: 'Remove configured rank roles', value: 'remove' },
            { name: 'Restore automatic XP rank', value: 'auto' },
          ),
      )
      .addRoleOption((o) =>
        o.setName('role').setDescription('Configured cosmetic rank role to add'),
      ),
  );

const pending = new Set<string>();
export async function execute(
  _bot: RA3Bot,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guild = interaction.guild;
  if (!guild || guildRepository.findByDiscordId(guild.id)?.activityRanksEnabled !== 1) {
    await interaction.reply({
      content: 'Activity ranks are disabled or this is not a server.',
      ephemeral: true,
    });
    return;
  }
  const action = interaction.options.getSubcommand();
  if (action === 'leaderboard') {
    await interaction.deferReply({ ephemeral: true });
    const entries = activityRankRepository.getLeaderboard(guild.id, 10);
    const definitions = activityRankRepository.getRankDefinitions(guild.id);
    const lines = await Promise.all(
      entries.map(async (entry, index) => {
        const member = await guild.members.fetch(entry.userId).catch(() => null);
        const rank = rankForPoints(entry.points, definitions);
        return `**${index + 1}.** ${escapeMarkdown(member?.displayName ?? 'Former member')} - **${entry.points.toLocaleString()} XP** · ${escapeMarkdown(rank?.title ?? 'Recruit')}`;
      }),
    );
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('🏅 Activity Leaderboard')
          .setDescription(lines.join('\n') || 'No activity has been recorded yet.')
          .setColor(0xd6ad43)
          .setFooter({
            text:
              'Pings count once per UTC day. ' +
              (activityRankRepository.getSettings(guild.id).chatEnabled
                ? 'Chat XP uses cooldown and daily limits.'
                : 'Ordinary chat earns no XP.'),
          }),
      ],
      allowedMentions: { parse: [] },
    });
    return;
  }
  const staff = await guild.members
    .fetch({ user: interaction.user.id, force: true })
    .catch(() => null);
  if (!staff || !isModerator(staff)) {
    await interaction.reply({
      content: 'Only admins and moderators can adjust XP or rank roles.',
      ephemeral: true,
    });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  const target = interaction.options.getUser('member', true);
  const key = guild.id + ':' + target.id;
  if (pending.has(key)) {
    await interaction.editReply('An adjustment is already running for this member.');
    return;
  }
  pending.add(key);
  try {
    const member = await guild.members.fetch({ user: target.id, force: true }).catch(() => null);
    if (!member || member.user.bot) throw new Error('Choose a current human server member.');
    if (guildRepository.findByDiscordId(guild.id)?.activityRanksEnabled !== 1)
      throw new Error('Activity ranks were disabled.');
    const before = activityRankRepository.getMember(guild.id, target.id);
    let detail = '';
    if (action === 'xp') {
      const amount = interaction.options.getInteger('amount', true);
      const activity = activityRankRepository.adjustPoints(guild.id, member.id, amount);
      const sync = await activityRankService.syncMemberRank(member, activity);
      detail = `XP updated: **${activity.points.toLocaleString()} XP**.${sync.detail ? ' ' + sync.detail : ''}`;
      audit('activity_staff_xp', {
        guildId: guild.id,
        staffId: staff.id,
        userId: member.id,
        amount,
      });
    } else if (action === 'role') {
      await guild.roles.fetch();
      await guild.channels.fetch();
      const mode = interaction.options.getString('action', true);
      if (!['add', 'remove', 'auto'].includes(mode)) throw new Error('Unknown rank role action.');
      const role = interaction.options.getRole('role');
      const rank = role
        ? activityRankRepository.getRankDefinitions(guild.id).find((r) => r.roleId === role.id)
        : undefined;
      if (mode === 'add') {
        if (!rank?.roleId) throw new Error('Choose a role linked in /activity admin.');
        const currentRole = guild.roles.cache.get(rank.roleId);
        if (!currentRole) throw new Error('The rank role no longer exists.');
        const denial = validateActivityRole(currentRole);
        if (denial) throw new Error(denial);
      }
      const activity = activityRankRepository.setManualRank(
        guild.id,
        member.id,
        mode === 'auto' ? null : mode === 'remove' ? 0 : rank!.id,
      );
      const sync = await activityRankService.syncMemberRank(member, activity);
      if (!['updated', 'unchanged'].includes(sync.status)) {
        activityRankRepository.setManualRank(guild.id, member.id, before?.manualRankId ?? null);
        await activityRankService.syncMemberRank(member);
        throw new Error(sync.detail ?? 'No rank roles are configured.');
      }
      detail =
        mode === 'auto'
          ? 'Automatic XP rank restored.'
          : mode === 'remove'
            ? 'Rank roles removed. Automatic role assignment is paused for this member.'
            : 'Rank role assigned. It stays pinned until you restore automatic ranking.';
      audit('activity_staff_role', {
        guildId: guild.id,
        staffId: staff.id,
        userId: member.id,
        mode,
        rankId: rank?.id,
      });
    } else throw new Error('Open /profile to see your activity rank.');
    await interaction.editReply({ content: '✅ ' + detail, allowedMentions: { parse: [] } });
  } catch (error) {
    await interaction.editReply({
      content: (error as Error).message,
      allowedMentions: { parse: [] },
    });
  } finally {
    pending.delete(key);
  }
}
