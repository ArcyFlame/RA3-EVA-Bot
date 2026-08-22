import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { RA3Bot } from '../../bot';
import { audit, logger } from '../../utils/logger';
import { checkTarget, clampReason, denyUnlessModerator, moderationDisabled } from './utils';

export const data = new SlashCommandBuilder()
  .setName('kick')
  .setDescription('Kick a member')
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
  .addUserOption((option) =>
    option.setName('user').setDescription('User to kick').setRequired(true),
  )
  .addStringOption((option) =>
    option.setName('reason').setDescription('Reason').setRequired(false),
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
  if (!targetMember.kickable) {
    await interaction.reply({
      content: '❌ I cannot kick this user (they may outrank me).',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();
  try {
    await targetMember.kick(`${reason} (kicked by ${interaction.user.tag})`);
  } catch (error) {
    logger.error('kick: failed to kick user:', error);
    await interaction.editReply({ content: '❌ Failed to kick the user.' });
    return;
  }
  audit('kick', {
    moderator: interaction.user.id,
    target: target.id,
    guild: interaction.guild.id,
    reason,
  });
  await interaction.editReply({ content: `✅ **${target.tag}** kicked. Reason: ${reason}` });
}
