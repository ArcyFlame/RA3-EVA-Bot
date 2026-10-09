import { ModalSubmitInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import {
  authorizeActivityControl,
  buildActivityAdminView,
  replyActivityError,
} from '../../commands/admin/activity-admin.view';
import { activityRankRepository } from '../../repositories/activity-rank.repository';
import { activityRankService } from '../../services/activity-rank.service';
import { audit } from '../../utils/logger';
import { guildRepository } from '../../repositories/guild.repository';

export const customIdPrefix = 'activity_modal:';

function numberField(interaction: ModalSubmitInteraction, field: string): number {
  const text = interaction.fields.getTextInputValue(field).trim();
  if (!/^-?\d+$/.test(text) || !Number.isSafeInteger(Number(text)))
    throw new Error('Enter whole numbers only.');
  return Number(text);
}

export async function execute(_bot: RA3Bot, interaction: ModalSubmitInteraction) {
  const control = await authorizeActivityControl(interaction);
  if (!control || !interaction.guild) return;
  const guild = interaction.guild;
  const { action, ref, version } = control;
  try {
    let screen: 'main' | 'rank' | 'member' | 'ratings' = 'main';
    let target: string | number = 0;
    let notice = '✅ Settings saved.';
    if (action === 'rating_xp') {
      if (guildRepository.findByDiscordId(guild.id)?.game !== 'genevo')
        throw new Error('Replay ratings are available only in GenEvo setup.');
      activityRankRepository.updateSettings(
        guild.id,
        {
          ratingPoints: numberField(interaction, 'points'),
          ratingMinVotes: numberField(interaction, 'minimum'),
          ratingReplayCap: numberField(interaction, 'replay'),
          ratingDailyCap: numberField(interaction, 'daily'),
          ratingAccountDays: numberField(interaction, 'age'),
        },
        version,
      );
      screen = 'ratings';
    } else if (action === 'xp') {
      activityRankRepository.updateSettings(
        guild.id,
        {
          pingPoints: numberField(interaction, 'ping_xp'),
          replayPoints: numberField(interaction, 'replay_xp'),
          replayDailyCap: numberField(interaction, 'replay_cap'),
          xpPerLevel: numberField(interaction, 'level_xp'),
        },
        version,
      );
      notice =
        '✅ XP and level settings saved. Rank thresholds were recalculated from the selected day schedule.';
    } else if (action === 'days') {
      const maxDays = interaction.fields.getTextInputValue('max_days').trim();
      activityRankRepository.updateSettings(
        guild.id,
        {
          daysPerRank: numberField(interaction, 'per_rank'),
          progressionMode: maxDays ? 'max_days' : 'per_rank',
          ...(maxDays ? { maxRankDays: numberField(interaction, 'max_days') } : {}),
        },
        version,
      );
      notice = '✅ Rank progression recalculated. Use Sync Rank Roles to apply the new thresholds.';
    } else if (action === 'add') {
      const rank = activityRankRepository.addRank(
        guild.id,
        interaction.fields.getTextInputValue('name'),
        version,
      );
      screen = 'rank';
      target = rank.id;
      notice = '✅ Rank added and the progression schedule recalculated.';
    } else if (action === 'edit') {
      activityRankRepository.editRank(
        guild.id,
        Number(ref),
        interaction.fields.getTextInputValue('name'),
        numberField(interaction, 'threshold'),
        version,
      );
      screen = 'rank';
      target = ref;
      notice = '✅ Rank updated. Use Sync Rank Roles to update members.';
    } else if (action === 'adjust') {
      if (interaction.isFromMessage()) await interaction.deferUpdate();
      else await interaction.deferReply({ ephemeral: true });
      const member = await guild.members.fetch(ref).catch(() => null);
      if (!member || member.user.bot) throw new Error('Choose a current human server member.');
      activityRankRepository.assertVersion(guild.id, version);
      const amount = numberField(interaction, 'amount');
      const activity = activityRankRepository.adjustPoints(guild.id, ref, amount);
      const result = await activityRankService.syncMemberRank(member, activity);
      screen = 'member';
      target = ref;
      notice = '✅ Member XP adjusted.' + (result.detail ? ' ' + result.detail : '');
    } else {
      throw new Error('Unknown activity form.');
    }
    audit('activity_settings_saved', {
      guildId: guild.id,
      adminId: interaction.user.id,
      action,
      target: ref,
    });
    const view = buildActivityAdminView(guild, interaction.user.id, screen, target, notice);
    if (interaction.deferred) await interaction.editReply(view);
    else if (interaction.isFromMessage()) await interaction.update(view);
    else await interaction.reply({ ...view, ephemeral: true });
  } catch (error) {
    await replyActivityError(interaction, error);
  }
}
