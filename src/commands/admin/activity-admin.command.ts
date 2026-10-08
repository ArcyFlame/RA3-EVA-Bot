import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  Role,
  SlashCommandBuilder,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import {
  activityRankRepository,
  DEFAULT_ACTIVITY_RANKS,
  MAX_DAILY_MESSAGE_AWARDS,
  MESSAGE_COOLDOWN_MS,
} from '../../repositories/activity-rank.repository';
import { guildRepository } from '../../repositories/guild.repository';
import { activityRankService } from '../../services/activity-rank.service';
import { audit } from '../../utils/logger';
import { resolveMember } from '../../utils/members';
import { denyUnlessAdmin } from '../../utils/permissions';

const rankChoices = DEFAULT_ACTIVITY_RANKS.map((rank) => ({
  name: `${rank.title} — Online Rank ${rank.rank}`,
  value: rank.rank,
}));

export const data = new SlashCommandBuilder()
  .setName('activity_admin')
  .setDescription('[Admin] Configure Discord activity ranks')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((subcommand) =>
    subcommand.setName('status').setDescription('Show activity rank configuration'),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('enable')
      .setDescription('Auto-detect Online Rank 1-9 roles and enable activity ranks'),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName('disable').setDescription('Stop tracking new activity'),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('role')
      .setDescription('Set the Discord role and points required for one rank')
      .addIntegerOption((option) =>
        option
          .setName('rank')
          .setDescription('Online rank number')
          .setRequired(true)
          .addChoices(...rankChoices),
      )
      .addRoleOption((option) =>
        option.setName('role').setDescription('Existing Nitro-style rank role').setRequired(true),
      )
      .addIntegerOption((option) =>
        option.setName('points').setDescription('Points needed for this rank').setMinValue(0),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('ping_role')
      .setDescription('Set the C&C ping role, or omit it to clear the setting')
      .addRoleOption((option) =>
        option.setName('role').setDescription('Role whose ping counts once per day'),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('adjust')
      .setDescription('Add or remove activity points from a member')
      .addUserOption((option) =>
        option.setName('member').setDescription('Member').setRequired(true),
      )
      .addIntegerOption((option) =>
        option
          .setName('amount')
          .setDescription('Positive or negative point amount')
          .setRequired(true)
          .setMinValue(-1_000_000)
          .setMaxValue(1_000_000),
      )
      .addStringOption((option) => option.setName('reason').setDescription('Audit reason')),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('reset')
      .setDescription("Reset one member's activity and remove their rank role")
      .addUserOption((option) =>
        option.setName('member').setDescription('Member').setRequired(true),
      )
      .addBooleanOption((option) =>
        option.setName('confirm').setDescription('Confirm the reset').setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('sync')
      .setDescription('Apply the correct rank role to every tracked member'),
  );

function validateManagedRole(role: Role): string | null {
  if (role.id === role.guild.id) return 'The @everyone role cannot be an activity rank.';
  if (role.managed) return 'Discord-managed roles cannot be used as activity ranks.';
  if (!role.editable) return `Move the bot role above **${role.name}** before assigning it.`;
  return null;
}

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: 'This command can only be used inside a server.',
      ephemeral: true,
    });
    return;
  }
  const invoker = await resolveMember(interaction);
  const denial = denyUnlessAdmin(invoker);
  if (denial) {
    await interaction.reply({ content: denial, ephemeral: true });
    return;
  }
  guildRepository.upsert(interaction.guild.id, {});
  const action = interaction.options.getSubcommand();

  if (action === 'status') {
    const guildData = guildRepository.findByDiscordId(interaction.guild.id)!;
    const definitions = activityRankRepository.getRankDefinitions(interaction.guild.id);
    const lines = definitions.map((definition) => {
      const role = definition.roleId ? interaction.guild!.roles.cache.get(definition.roleId) : null;
      return `**${definition.rank}. ${definition.title}** — ${definition.threshold.toLocaleString()} points — ${role ? role.name : 'not configured'}`;
    });
    const pingRole = guildData.cncPingRoleId
      ? interaction.guild.roles.cache.get(guildData.cncPingRoleId)
      : null;
    const embed = new EmbedBuilder()
      .setTitle('🎖️ Activity Rank Configuration')
      .setColor(guildData.activityRanksEnabled === 1 ? 0x57f287 : 0xed4245)
      .setDescription(
        `Tracking is **${guildData.activityRanksEnabled === 1 ? 'enabled' : 'disabled'}**.`,
      )
      .addFields(
        { name: 'Rank Roles', value: lines.join('\n') },
        { name: 'C&C Ping Role', value: pingRole?.name ?? 'Not configured' },
        {
          name: 'Anti-spam Rules',
          value: `Messages: one award every ${MESSAGE_COOLDOWN_MS / 1000} seconds, repeated content is ignored, maximum ${MAX_DAILY_MESSAGE_AWARDS} awards per UTC day.\nC&C ping: one award per member per UTC day.`,
        },
      );
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (action === 'enable') {
    await interaction.guild.roles.fetch();
    const detected = activityRankService.autoConfigureRoles(interaction.guild);
    if (detected.missing.length > 0) {
      await interaction.reply({
        content:
          `I found ${detected.configured.length}/9 rank roles. Missing Online Rank: **${detected.missing.join(', ')}**. ` +
          'Create those roles or configure them individually with `/activity_admin role`.',
        ephemeral: true,
      });
      return;
    }
    const blocked = activityRankRepository
      .getRankDefinitions(interaction.guild.id)
      .map((definition) => interaction.guild!.roles.cache.get(definition.roleId!))
      .find((role) => role && validateManagedRole(role));
    if (blocked) {
      await interaction.reply({ content: validateManagedRole(blocked)!, ephemeral: true });
      return;
    }
    guildRepository.toggleFeature(interaction.guild.id, 'activityRanks', true);
    audit('activity_ranks_enabled', { guildId: interaction.guild.id, userId: interaction.user.id });
    const guildData = guildRepository.findByDiscordId(interaction.guild.id)!;
    await interaction.reply({
      content:
        '✅ Activity ranking is enabled and all nine roles were detected.' +
        (guildData.cncPingRoleId
          ? ''
          : ' Set the C&C ping role with `/activity_admin ping_role` to enable its daily credit.'),
      ephemeral: true,
    });
    return;
  }

  if (action === 'disable') {
    guildRepository.toggleFeature(interaction.guild.id, 'activityRanks', false);
    audit('activity_ranks_disabled', {
      guildId: interaction.guild.id,
      userId: interaction.user.id,
    });
    await interaction.reply({
      content: '✅ Activity tracking is disabled. Existing points and roles were preserved.',
      ephemeral: true,
    });
    return;
  }

  if (action === 'role') {
    const rankNumber = interaction.options.getInteger('rank', true);
    const selectedRole = interaction.options.getRole('role', true);
    const role =
      interaction.guild.roles.cache.get(selectedRole.id) ??
      (await interaction.guild.roles.fetch(selectedRole.id));
    if (!role) {
      await interaction.reply({ content: '❌ That role no longer exists.', ephemeral: true });
      return;
    }
    const roleError = validateManagedRole(role);
    if (roleError) {
      await interaction.reply({ content: `❌ ${roleError}`, ephemeral: true });
      return;
    }
    const defaults = DEFAULT_ACTIVITY_RANKS.find((rank) => rank.rank === rankNumber)!;
    const threshold = interaction.options.getInteger('points') ?? defaults.threshold;
    const current = activityRankRepository.getRankDefinitions(interaction.guild.id);
    const previous = current.find((rank) => rank.rank === rankNumber - 1);
    const next = current.find((rank) => rank.rank === rankNumber + 1);
    if ((previous && threshold <= previous.threshold) || (next && threshold >= next.threshold)) {
      await interaction.reply({
        content: '❌ Points must be higher than the previous rank and lower than the next rank.',
        ephemeral: true,
      });
      return;
    }
    activityRankRepository.setRankRole(interaction.guild.id, rankNumber, role.id, threshold);
    audit('activity_rank_role_configured', {
      guildId: interaction.guild.id,
      userId: interaction.user.id,
      rank: rankNumber,
      roleId: role.id,
      threshold,
    });
    await interaction.reply({
      content: `✅ Online Rank ${rankNumber} uses **${role.name}** at **${threshold.toLocaleString()}** points. Run \`/activity_admin sync\` if members already have activity points.`,
      ephemeral: true,
    });
    return;
  }

  if (action === 'ping_role') {
    const role = interaction.options.getRole('role');
    guildRepository.setCncPingRole(interaction.guild.id, role?.id ?? null);
    audit('activity_cnc_ping_role_changed', {
      guildId: interaction.guild.id,
      userId: interaction.user.id,
      roleId: role?.id ?? null,
    });
    await interaction.reply({
      content: role
        ? `✅ A ping of **${role.name}** can now earn credit once per member per UTC day.`
        : '✅ The C&C ping activity credit was cleared.',
      ephemeral: true,
    });
    return;
  }

  if (action === 'adjust') {
    const user = interaction.options.getUser('member', true);
    const amount = interaction.options.getInteger('amount', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    const activity = activityRankRepository.adjustPoints(interaction.guild.id, user.id, amount);
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const sync = member ? await activityRankService.syncMemberRank(member, activity) : null;
    audit('activity_points_adjusted', {
      guildId: interaction.guild.id,
      moderatorId: interaction.user.id,
      userId: user.id,
      amount,
      points: activity.points,
      reason,
    });
    await interaction.reply({
      content: `✅ ${amount >= 0 ? 'Added' : 'Removed'} **${Math.abs(amount).toLocaleString()}** points ${amount >= 0 ? 'to' : 'from'} **${user.displayName}**. New total: **${activity.points.toLocaleString()}**.${sync?.detail ? ` ${sync.detail}` : ''}`,
      ephemeral: true,
    });
    return;
  }

  if (action === 'reset') {
    if (!interaction.options.getBoolean('confirm', true)) {
      await interaction.reply({ content: 'Nothing was changed.', ephemeral: true });
      return;
    }
    const user = interaction.options.getUser('member', true);
    activityRankRepository.resetMember(interaction.guild.id, user.id);
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const sync = member ? await activityRankService.syncMemberRank(member) : null;
    audit('activity_member_reset', {
      guildId: interaction.guild.id,
      moderatorId: interaction.user.id,
      userId: user.id,
    });
    await interaction.reply({
      content: `✅ Reset activity for **${user.displayName}**.${sync?.detail ? ` ${sync.detail}` : ''}`,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const result = await activityRankService.syncGuild(interaction.guild);
  await interaction.editReply(
    `✅ Rank sync complete: **${result.updated}** updated, **${result.unchanged}** already correct, **${result.failed}** unavailable or blocked.`,
  );
}
