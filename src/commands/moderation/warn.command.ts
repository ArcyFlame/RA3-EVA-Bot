import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { warningRepository } from '../../repositories/warning.repository';
import { audit, logger } from '../../utils/logger';
import { checkTarget, clampReason, denyUnlessModerator, moderationDisabled } from './utils';

export const data = new SlashCommandBuilder()
  .setName('warn')
  .setDescription('Warn a member')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((option) =>
    option.setName('user').setDescription('User to warn').setRequired(true),
  )
  .addStringOption((option) =>
    option.setName('reason').setDescription('Reason for warning').setRequired(false),
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

  // Hierarchy/self checks apply when the target is a server member.
  const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (targetMember) {
    const targetDenial = checkTarget(interaction.guild, gate.invoker, targetMember);
    if (targetDenial) {
      await interaction.reply({ content: targetDenial, ephemeral: true });
      return;
    }
  }

  warningRepository.addWarning(interaction.guild.id, target.id, interaction.user.id, reason);
  audit('warn', {
    moderator: interaction.user.id,
    target: target.id,
    guild: interaction.guild.id,
    reason,
  });

  // Defer before the (potentially slow) DM send below.
  await interaction.deferReply();

  const embed = new EmbedBuilder()
    .setTitle('⚠️ Warning')
    .setDescription(`You have been warned in **${interaction.guild.name}**.`)
    .addFields(
      { name: 'Moderator', value: interaction.user.tag, inline: true },
      { name: 'Reason', value: reason, inline: true },
    );
  await target
    .send({ embeds: [embed] })
    .catch(() => logger.debug(`Could not DM warning to ${target.id}`));

  await interaction.editReply({ content: `✅ Warned **${target.tag}**. Reason: ${reason}` });
}
