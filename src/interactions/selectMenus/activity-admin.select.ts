import { AnySelectMenuInteraction, ChannelType } from 'discord.js';
import { RA3Bot } from '../../bot';
import {
  authorizeActivityControl,
  buildActivityAdminView,
  replyActivityError,
} from '../../commands/admin/activity-admin.view';
import { activityRankRepository } from '../../repositories/activity-rank.repository';
import { guildRepository } from '../../repositories/guild.repository';
import { validateActivityRole } from '../../services/activity-rank.service';
import { audit } from '../../utils/logger';

export const customIdPrefix = 'activity_sel:';

export async function execute(_bot: RA3Bot, interaction: AnySelectMenuInteraction) {
  const control = await authorizeActivityControl(interaction);
  if (!control || !interaction.guild) return;
  const guild = interaction.guild;
  const selected = interaction.values[0];
  try {
    if (control.action === 'rank' && interaction.isStringSelectMenu()) {
      if (!/^\d+$/.test(selected) || !activityRankRepository.getRank(guild.id, Number(selected)))
        throw new Error('This rank no longer exists.');
      await interaction.update(
        buildActivityAdminView(guild, interaction.user.id, 'rank', selected),
      );
      return;
    }
    if (control.action === 'member' && interaction.isUserSelectMenu()) {
      const member = await guild.members.fetch(selected).catch(() => null);
      if (!member || member.user.bot) throw new Error('Choose a current human server member.');
      await interaction.update(
        buildActivityAdminView(guild, interaction.user.id, 'member', selected),
      );
      return;
    }
    if (control.action === 'role' && interaction.isRoleSelectMenu()) {
      const role = await guild.roles.fetch(selected);
      if (!role) throw new Error('This role no longer exists.');
      const error = validateActivityRole(role);
      if (error) throw new Error(error);
      activityRankRepository.setRankRole(guild.id, Number(control.ref), role.id, control.version);
      await interaction.update(
        buildActivityAdminView(
          guild,
          interaction.user.id,
          'rank',
          control.ref,
          '✅ Rank role linked. Use Sync Rank Roles to update members.',
        ),
      );
    } else if (control.action === 'ping' && interaction.isRoleSelectMenu()) {
      const role = await guild.roles.fetch(selected);
      if (!role || role.id === guild.id || role.managed)
        throw new Error('Choose an ordinary C&C ping role.');
      activityRankRepository.assertVersion(guild.id, control.version);
      guildRepository.setCncPingRole(guild.id, role.id);
      activityRankRepository.touchConfiguration(guild.id, control.version);
      await interaction.update(
        buildActivityAdminView(
          guild,
          interaction.user.id,
          'sources',
          0,
          '✅ Daily C&C ping role saved.',
        ),
      );
    } else if (control.action === 'replay' && interaction.isChannelSelectMenu()) {
      const channel = await guild.channels.fetch(selected);
      if (!channel || channel.type !== ChannelType.GuildText)
        throw new Error('Choose a text channel in this server.');
      activityRankRepository.updateSettings(
        guild.id,
        { replayChannelId: channel.id },
        control.version,
      );
      await interaction.update(
        buildActivityAdminView(
          guild,
          interaction.user.id,
          'sources',
          0,
          '✅ Replay channel saved.',
        ),
      );
    } else {
      throw new Error('Unknown activity selection.');
    }
    audit('activity_source_or_role_changed', {
      guildId: guild.id,
      adminId: interaction.user.id,
      action: control.action,
      target: selected,
    });
  } catch (error) {
    await replyActivityError(interaction, error);
  }
}
