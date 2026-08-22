import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { RA3Bot } from '../../bot';
import { audit, logger } from '../../utils/logger';
import { checkTarget, clampReason, denyUnlessModerator, moderationDisabled } from './utils';

export const data = new SlashCommandBuilder()
  .setName('ban')
  .setDescription('Ban a member')
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addUserOption((option) => option.setName('user').setDescription('User to ban').setRequired(true))
  .addStringOption((option) => option.setName('reason').setDescription('Reason').setRequired(false))
  .addIntegerOption((option) =>
    option
      .setName('delete_days')
      .setDescription('Delete messages (0-7 days)')
      .setMinValue(0)
      .setMaxValue(7)
      .setRequired(false),
  );

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ This command can only be used inside a server.',
      ephemeral: true,
    });
    return;
  }

  const featureDenial = moderationDisabled(interaction.guild);
  if (featureDenial) {
    await interaction.reply({ content: featureDenial, ephemeral: true });
    return;
  }

  const gate = await denyUnlessModerator(interaction);
  if ('error' in gate) {
    await interaction.reply({ content: gate.error, ephemeral: true });
    return;
  }

  const target = interaction.options.getUser('user', true);
  const reason = clampReason(interaction.options.getString('reason'));
  const deleteDays = interaction.options.getInteger('delete_days') ?? 0;

  const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (!targetMember) {
    await interaction.reply({ content: '❌ That user is not in this server.', ephemeral: true });
    return;
  }

  const targetDenial = checkTarget(interaction.guild, gate.invoker, targetMember);
  if (targetDenial) {
    await interaction.reply({ content: targetDenial, ephemeral: true });
    return;
  }
  if (!targetMember.bannable) {
    await interaction.reply({
      content: '❌ I cannot ban this user (they may outrank me).',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();
  try {
    await interaction.guild.bans.create(targetMember, {
      reason: `${reason} (banned by ${interaction.user.tag})`,
      deleteMessageSeconds: deleteDays * 86400,
    });
  } catch (error) {
    logger.error('ban: failed to ban user:', error);
    await interaction.editReply({ content: '❌ Failed to ban the user.' });
    return;
  }
  audit('ban', {
    moderator: interaction.user.id,
    target: target.id,
    guild: interaction.guild.id,
    reason,
    deleteDays,
  });
  await interaction.editReply({ content: `✅ **${target.tag}** banned. Reason: ${reason}` });
}
