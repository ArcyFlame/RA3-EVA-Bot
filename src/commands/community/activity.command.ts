import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  SlashCommandBuilder,
  User,
  escapeMarkdown,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { activityRankRepository } from '../../repositories/activity-rank.repository';
import { guildRepository } from '../../repositories/guild.repository';
import { nextRankForPoints, rankForPoints } from '../../services/activity-rank.service';

export const data = new SlashCommandBuilder()
  .setName('activity')
  .setDescription('Discord activity ranks and leaderboard')
  .addSubcommand((subcommand) =>
    subcommand
      .setName('rank')
      .setDescription("Show your activity rank or another member's rank")
      .addUserOption((option) =>
        option.setName('member').setDescription('Member to view').setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName('leaderboard').setDescription('Show the most active server members'),
  );

function progressBar(current: number, target: number): string {
  if (target <= 0) return '██████████';
  const filled = Math.max(0, Math.min(10, Math.floor((current / target) * 10)));
  return `${'█'.repeat(filled)}${'░'.repeat(10 - filled)}`;
}

function displayName(member: GuildMember | null, user: User): string {
  return escapeMarkdown(member?.displayName ?? user.displayName);
}

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: 'This command can only be used inside a server.',
      ephemeral: true,
    });
    return;
  }
  const guildData = guildRepository.findByDiscordId(interaction.guild.id);
  if (guildData?.activityRanksEnabled !== 1) {
    await interaction.reply({
      content: 'Discord activity ranks are disabled on this server.',
      ephemeral: true,
    });
    return;
  }

  const action = interaction.options.getSubcommand();
  if (action === 'leaderboard') {
    await interaction.deferReply();
    const entries = activityRankRepository.getLeaderboard(interaction.guild.id, 10);
    if (entries.length === 0) {
      await interaction.editReply('No activity has been recorded yet.');
      return;
    }
    const definitions = activityRankRepository.getRankDefinitions(interaction.guild.id);
    const lines = await Promise.all(
      entries.map(async (entry, index) => {
        const member = await interaction.guild!.members.fetch(entry.userId).catch(() => null);
        const name = escapeMarkdown(member?.displayName ?? 'Former member');
        const rank = rankForPoints(entry.points, definitions);
        const medal =
          index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `**${index + 1}.**`;
        return `${medal} ${name} — **${entry.points.toLocaleString()}** XP · ${rank ? `${escapeMarkdown(rank.title)} (Rank ${rank.rank})` : 'Recruit'}`;
      }),
    );
    const embed = new EmbedBuilder()
      .setTitle('🏅 Discord Activity Leaderboard')
      .setDescription(lines.join('\n'))
      .setColor(0xf1c40f)
      .setFooter({
        text: 'One C&C ping award per UTC day. Valid replay uploads can also earn XP.',
      });
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const target = interaction.options.getUser('member') ?? interaction.user;
  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  const activity = activityRankRepository.getMember(interaction.guild.id, target.id);
  const points = activity?.points ?? 0;
  const settings = activityRankRepository.getSettings(interaction.guild.id);
  const definitions = activityRankRepository.getRankDefinitions(interaction.guild.id);
  const currentRank = rankForPoints(points, definitions);
  const nextRank = nextRankForPoints(points, definitions);
  const position = activityRankRepository.getMemberPosition(interaction.guild.id, target.id);
  const base = currentRank?.threshold ?? 0;
  const progress = nextRank ? points - base : 1;
  const targetProgress = nextRank ? nextRank.threshold - base : 1;
  const configuredRole = currentRank?.roleId
    ? interaction.guild.roles.cache.get(currentRank.roleId)
    : undefined;

  const embed = new EmbedBuilder()
    .setTitle(`🎖️ ${displayName(member, target)} — Activity Rank`)
    .setThumbnail(target.displayAvatarURL())
    .setColor(configuredRole?.color || 0x5865f2)
    .addFields(
      {
        name: 'Current Rank',
        value: currentRank
          ? `**${escapeMarkdown(currentRank.title)}** · Rank ${currentRank.rank}`
          : '**Recruit**',
        inline: true,
      },
      {
        name: 'XP / Level',
        value: `**${points.toLocaleString()} XP** · Level **${Math.floor(points / settings.xpPerLevel)}**`,
        inline: true,
      },
      {
        name: 'Server Position',
        value: position ? `**#${position}**` : 'Not ranked',
        inline: true,
      },
      {
        name: nextRank ? `Progress to ${escapeMarkdown(nextRank.title)}` : 'Highest Rank Reached',
        value: nextRank
          ? `\`${progressBar(progress, targetProgress)}\` ${Math.max(0, progress).toLocaleString()} / ${targetProgress.toLocaleString()}`
          : '`██████████` ' + escapeMarkdown(currentRank?.title ?? 'Complete'),
      },
      {
        name: 'Counted Activity',
        value: `${activity?.qualifyingCncPings ?? 0} daily C&C pings · ${activity?.qualifyingReplays ?? 0} replay files`,
      },
    )
    .setFooter({
      text: 'C&C pings count once per UTC day. Ordinary chat earns no XP.',
    });
  await interaction.reply({ embeds: [embed] });
}
