import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  RepliableInteraction,
  SlashCommandBuilder,
  User,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { userRepository } from '../../repositories/user.repository';
import { buildDiscordProfileEmbed } from '../profile/profile.command';
import { denyUnlessAdmin, isOwner } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';
import { getGameContext } from '../../utils/game-context';

export const data = new SlashCommandBuilder()
  .setName('profile_admin')
  .setDescription('[Admin] View or remove linked player profiles')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((subcommand) =>
    subcommand
      .setName('view')
      .setDescription('View a member profile as an admin')
      .addUserOption((option) =>
        option.setName('user').setDescription('Member; omit to choose in the menu'),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('unlink')
      .setDescription('Remove one linked platform from a member profile')
      .addUserOption((option) =>
        option.setName('user').setDescription('Member; omit to choose in the menu'),
      )
      .addStringOption((option) =>
        option
          .setName('platform')
          .setDescription('Linked platform to remove')
          .addChoices(
            { name: 'Shatabrick', value: 'shatabrick' },
            { name: 'RA3BattleNet', value: 'ra3b' },
          ),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('clear')
      .setDescription('Clear both linked identities and the community rank')
      .addUserOption((option) =>
        option.setName('user').setDescription('Member whose profile is cleared').setRequired(true),
      )
      .addBooleanOption((option) =>
        option
          .setName('confirm')
          .setDescription('Confirm that both linked identities should be cleared')
          .setRequired(true),
      ),
  );

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  const action = interaction.options.getSubcommand();
  const target = interaction.options.getUser('user');
  const platform = action === 'unlink' ? interaction.options.getString('platform') : null;
  if (!target || (action === 'unlink' && !platform)) {
    const { openProfileAdminMenu } = await import('./profile-admin-menu.view');
    await openProfileAdminMenu(interaction, target?.id);
    return;
  }
  await applyProfileAction(
    interaction,
    action,
    target,
    platform,
    action === 'clear' ? interaction.options.getBoolean('confirm', true) : false,
  );
}

export async function applyProfileAction(
  interaction: RepliableInteraction,
  action: string,
  target: User,
  platform: string | null = null,
  confirm = false,
) {
  const member = await resolveMember(interaction);
  const denial = denyUnlessAdmin(member);
  if (denial) {
    await interaction.reply({ content: denial, ephemeral: true });
    return;
  }

  if (action !== 'view' && target.id !== interaction.user.id && !isOwner(interaction.user.id)) {
    await interaction.reply({
      content:
        'Only the profile owner or bot owner can remove shared linked identities. Server admins can still view profiles.',
      ephemeral: true,
    });
    return;
  }
  if (action === 'view') {
    await interaction.deferReply({ ephemeral: true });
    const embed = await buildDiscordProfileEmbed(
      target,
      userRepository.getLanguage(target.id),
      getGameContext(interaction.guildId).game,
      interaction.guildId,
    );
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (action === 'unlink') {
    if (!['shatabrick', 'ra3b'].includes(platform ?? '')) {
      await interaction.reply({ content: 'Choose a linked platform.', ephemeral: true });
      return;
    }
    if (platform === 'shatabrick') userRepository.unlinkShatabrick(target.id);
    else userRepository.unlinkRa3BattleNet(target.id);
    await interaction.reply({
      content: `✅ Removed ${platform === 'shatabrick' ? 'Shatabrick' : 'RA3BattleNet'} from **${target.displayName}**.`,
      ephemeral: true,
    });
    return;
  }

  if (!confirm) {
    await interaction.reply({ content: 'Nothing was changed.', ephemeral: true });
    return;
  }
  userRepository.clearLinkedProfile(target.id);
  await interaction.reply({
    content: `✅ Cleared linked game identities for **${target.displayName}**. Their language and notification settings were preserved.`,
    ephemeral: true,
  });
}
