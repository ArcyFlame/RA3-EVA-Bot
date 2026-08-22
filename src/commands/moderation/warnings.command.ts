import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { warningRepository } from '../../repositories/warning.repository';
import { denyUnlessModerator, moderationDisabled } from './utils';

export const data = new SlashCommandBuilder()
  .setName('warnings')
  .setDescription('View warnings for a user')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((option) =>
    option.setName('user').setDescription('User to check').setRequired(true),
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
  const warnings = warningRepository.getWarningsForUser(interaction.guild.id, target.id);
  if (warnings.length === 0) {
    await interaction.reply({ content: `**${target.tag}** has no warnings.`, ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`Warnings for ${target.tag}`)
    .setColor(0xffa500)
    .setFooter({ text: `Showing ${Math.min(warnings.length, 10)} of ${warnings.length}` });

  for (const warning of warnings.slice(0, 10)) {
    embed.addFields({
      name: new Date(warning.createdAt.replace(' ', 'T') + 'Z').toLocaleDateString(),
      value: `Mod: <@${warning.moderatorId}>\nReason: ${warning.reason ?? 'No reason provided'}`,
      inline: false,
    });
  }
  await interaction.reply({ embeds: [embed], ephemeral: true });
}
