import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { RA3Bot } from '../../bot';
import { warningRepository } from '../../repositories/warning.repository';
import { audit } from '../../utils/logger';
import { denyUnlessModerator, moderationDisabled, checkTarget } from './utils';

export const data = new SlashCommandBuilder()
  .setName('clear_warnings')
  .setDescription('Clear all warnings for a user')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((option) =>
    option.setName('user').setDescription('User to clear').setRequired(true),
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
  const targetMember =
    interaction.guild.members.cache.get(target.id) ??
    (await interaction.guild.members.fetch(target.id).catch(() => null));
  if (targetMember) {
    const hierarchy = checkTarget(interaction.guild, gate.invoker, targetMember);
    if (hierarchy) {
      await interaction.reply({ content: hierarchy, ephemeral: true });
      return;
    }
  }

  const count = warningRepository.clearWarningsForUser(interaction.guild.id, target.id);
  audit('clear_warnings', {
    moderator: interaction.user.id,
    target: target.id,
    guild: interaction.guild.id,
    cleared: count,
  });
  await interaction.reply({
    content: `✅ Cleared ${count} warning(s) for **${target.tag}**.`,
    ephemeral: true,
  });
}
