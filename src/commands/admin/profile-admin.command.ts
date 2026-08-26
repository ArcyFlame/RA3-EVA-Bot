import { ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { RA3Bot } from '../../bot';
import { userRepository } from '../../repositories/user.repository';
import { buildDiscordProfileEmbed } from '../profile/profile.command';
import { denyUnlessAdmin } from '../../utils/permissions';
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
        option.setName('user').setDescription('Member to inspect').setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('unlink')
      .setDescription('Remove one linked platform from a member profile')
      .addUserOption((option) =>
        option.setName('user').setDescription('Member whose link is removed').setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName('platform')
          .setDescription('Linked platform to remove')
          .setRequired(true)
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
  const member = await resolveMember(interaction);
  const denial = denyUnlessAdmin(member);
  if (denial) {
    await interaction.reply({ content: denial, ephemeral: true });
    return;
  }

  const action = interaction.options.getSubcommand();
  const target = interaction.options.getUser('user', true);
  if (action === 'view') {
    await interaction.deferReply({ ephemeral: true });
    const embed = await buildDiscordProfileEmbed(
      target,
      userRepository.getLanguage(target.id),
      getGameContext(interaction.guildId).game,
    );
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (action === 'unlink') {
    const platform = interaction.options.getString('platform', true);
    if (platform === 'shatabrick') userRepository.unlinkShatabrick(target.id);
    else userRepository.unlinkRa3BattleNet(target.id);
    await interaction.reply({
      content: `✅ Removed ${platform === 'shatabrick' ? 'Shatabrick' : 'RA3BattleNet'} from **${target.displayName}**.`,
      ephemeral: true,
    });
    return;
  }

  if (!interaction.options.getBoolean('confirm', true)) {
    await interaction.reply({ content: 'Nothing was changed.', ephemeral: true });
    return;
  }
  userRepository.clearLinkedProfile(target.id);
  await interaction.reply({
    content: `✅ Cleared linked game identities for **${target.displayName}**. Their language and notification settings were preserved.`,
    ephemeral: true,
  });
}
