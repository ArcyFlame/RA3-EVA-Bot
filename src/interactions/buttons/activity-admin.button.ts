import { ButtonInteraction, PermissionFlagsBits } from 'discord.js';
import { RA3Bot } from '../../bot';
import {
  activityModal,
  ActivityScreen,
  authorizeActivityControl,
  buildActivityAdminView,
  replyActivityError,
} from '../../commands/admin/activity-admin.view';
import { activityRankRepository } from '../../repositories/activity-rank.repository';
import { guildRepository } from '../../repositories/guild.repository';
import { activityRankService } from '../../services/activity-rank.service';
import { audit } from '../../utils/logger';

export const customIdPrefix = 'activity_btn:';
const creatingRoles = new Set<string>();
const screens = new Set<ActivityScreen>([
  'main',
  'sources',
  'ranks',
  'rank',
  'role',
  'ping',
  'replay',
  'members',
  'member',
  'delete',
  'reset',
]);

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  const control = await authorizeActivityControl(interaction);
  if (!control || !interaction.guild) return;
  const guild = interaction.guild;
  const { action, ref, version } = control;
  const settings = activityRankRepository.getSettings(guild.id);
  try {
    if (screens.has(action as ActivityScreen)) {
      await interaction.update(
        buildActivityAdminView(guild, interaction.user.id, action as ActivityScreen, ref),
      );
      return;
    }
    if (action === 'xp') {
      await interaction.showModal(
        activityModal('xp', '0', version, interaction.user.id, 'XP & Levels', [
          {
            id: 'ping_xp',
            label: 'XP per daily C&C ping (1–10000)',
            value: String(settings.pingPoints),
          },
          {
            id: 'replay_xp',
            label: 'XP per replay file (1–10000)',
            value: String(settings.replayPoints),
          },
          {
            id: 'replay_cap',
            label: 'Replay awards per UTC day (1–20)',
            value: String(settings.replayDailyCap),
          },
          { id: 'level_xp', label: 'XP per level (1–1000000)', value: String(settings.xpPerLevel) },
        ]),
      );
      return;
    }
    if (action === 'days') {
      await interaction.showModal(
        activityModal('days', '0', version, interaction.user.id, 'Days & Rank Progression', [
          {
            id: 'per_rank',
            label: 'Ping days per rank (1–10000)',
            value: String(settings.daysPerRank),
          },
          {
            id: 'max_days',
            label: 'Total days to top rank (blank = per rank)',
            required: false,
            value:
              settings.progressionMode === 'max_days' ? String(settings.maxRankDays) : undefined,
          },
        ]),
      );
      return;
    }
    if (action === 'add' || action === 'edit') {
      const rank = action === 'edit' ? activityRankRepository.getRank(guild.id, Number(ref)) : null;
      if (action === 'edit' && !rank) throw new Error('This rank no longer exists.');
      await interaction.showModal(
        activityModal(
          action,
          ref,
          version,
          interaction.user.id,
          action === 'add' ? 'Add Activity Rank' : 'Edit Activity Rank',
          [
            { id: 'name', label: 'Rank name', value: rank?.title },
            ...(rank
              ? [{ id: 'threshold', label: 'Required XP', value: String(rank.threshold) }]
              : []),
          ],
        ),
      );
      return;
    }
    if (action === 'adjust') {
      await interaction.showModal(
        activityModal('adjust', ref, version, interaction.user.id, 'Adjust Member XP', [
          { id: 'amount', label: 'XP to add or remove (e.g. 50 or -50)' },
        ]),
      );
      return;
    }

    let screen: ActivityScreen = 'main';
    let target: string | number = 0;
    let notice = '✅ Settings saved.';
    if (action === 'enable' || action === 'disable') {
      if (action === 'enable' && activityRankRepository.getRankDefinitions(guild.id).length === 0)
        throw new Error('Add at least one rank before enabling the system.');
      guildRepository.toggleFeature(guild.id, 'activityRanks', action === 'enable');
      activityRankRepository.touchConfiguration(guild.id, version);
      notice =
        action === 'enable' ? '✅ Activity ranking enabled.' : '✅ Activity ranking disabled.';
    } else if (action === 'toggle_ping' || action === 'toggle_replay') {
      activityRankRepository.updateSettings(
        guild.id,
        action === 'toggle_ping'
          ? { pingEnabled: !settings.pingEnabled }
          : { replayEnabled: !settings.replayEnabled },
        version,
      );
      screen = 'sources';
    } else if (action === 'clear_ping') {
      guildRepository.setCncPingRole(guild.id, null);
      activityRankRepository.touchConfiguration(guild.id, version);
      screen = 'sources';
    } else if (action === 'up' || action === 'down') {
      activityRankRepository.moveRank(guild.id, Number(ref), action === 'up' ? -1 : 1, version);
      screen = 'rank';
      target = ref;
    } else if (action === 'detach') {
      activityRankRepository.setRankRole(guild.id, Number(ref), null, version);
      screen = 'rank';
      target = ref;
      notice = '✅ Role unlinked. Use Sync Rank Roles to update tracked members.';
    } else if (action === 'delete_confirm') {
      activityRankRepository.removeRank(guild.id, Number(ref), version);
      screen = 'ranks';
      notice =
        '✅ Rank removed and the progression schedule recalculated. Use Sync Rank Roles to update members.';
    } else if (action === 'reset_confirm') {
      await interaction.deferUpdate();
      const member = await guild.members.fetch(ref).catch(() => null);
      if (!member || member.user.bot) throw new Error('Choose a current human server member.');
      activityRankRepository.assertVersion(guild.id, version);
      activityRankRepository.resetMember(guild.id, ref);
      const result = await activityRankService.syncMemberRank(member);
      screen = 'member';
      target = ref;
      notice = '✅ Member XP reset.' + (result.detail ? ' ' + result.detail : '');
    } else if (action === 'create') {
      const rank = activityRankRepository.getRank(guild.id, Number(ref));
      if (!rank || rank.roleId) throw new Error('Choose an unlinked rank first.');
      const key = guild.id + ':' + rank.id;
      if (creatingRoles.has(key)) throw new Error('This role is already being created.');
      if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles))
        throw new Error('The bot needs Manage Roles to create rank roles.');
      creatingRoles.add(key);
      await interaction.deferUpdate();
      try {
        const role = await guild.roles.create({
          name: rank.title,
          permissions: [],
          mentionable: false,
          reason: 'Activity rank created by ' + interaction.user.id,
        });
        try {
          activityRankRepository.setRankRole(guild.id, rank.id, role.id, version);
        } catch (error) {
          await role
            .delete('Activity configuration changed before the role could be linked')
            .catch(() => null);
          throw error;
        }
      } finally {
        creatingRoles.delete(key);
      }
      screen = 'rank';
      target = ref;
      notice = '✅ Discord role created and linked. Use Sync Rank Roles to apply it to members.';
    } else if (action === 'sync') {
      await interaction.deferUpdate();
      await guild.roles.fetch();
      const result = await activityRankService.syncGuild(guild);
      notice =
        '✅ Rank sync: ' +
        result.updated +
        ' updated · ' +
        result.unchanged +
        ' already correct · ' +
        result.failed +
        ' unavailable or blocked.';
    } else {
      throw new Error('Unknown activity action. Reopen /activity_admin.');
    }
    audit('activity_configuration_changed', {
      guildId: guild.id,
      adminId: interaction.user.id,
      action,
      target: ref,
    });
    const view = buildActivityAdminView(guild, interaction.user.id, screen, target, notice);
    if (interaction.deferred) await interaction.editReply(view);
    else await interaction.update(view);
  } catch (error) {
    await replyActivityError(interaction, error);
  }
}
