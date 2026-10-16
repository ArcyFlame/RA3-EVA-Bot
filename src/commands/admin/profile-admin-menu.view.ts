import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  UserSelectMenuBuilder,
} from 'discord.js';
import {
  MenuInteraction,
  PrivateMenu,
  PrivateMenuSessions,
} from '../../utils/private-menu-session';
import { denyUnlessAdmin, isOwner } from '../../utils/permissions';
import { userRepository } from '../../repositories/user.repository';
import { applyProfileAction } from './profile-admin.command';

interface ProfileMenu {
  userId?: string;
  pending?: 'shatabrick' | 'ra3b' | 'clear';
  fingerprint?: string;
}
const sessions = new PrivateMenuSessions<ProfileMenu>();
const fingerprint = (userId: string) => {
  const user = userRepository.findByDiscordId(userId);
  return JSON.stringify([
    user?.shatabrickUsername,
    user?.ra3bUsername,
    user?.ra3bPersonaId,
    user?.rank,
  ]);
};
async function authorize(interaction: ChatInputCommandInteraction | MenuInteraction) {
  const member = await interaction.guild?.members
    .fetch({ user: interaction.user.id, force: true })
    .catch(() => null);
  const denial = denyUnlessAdmin(member ?? null);
  if (denial) await interaction.reply({ content: denial, ephemeral: true });
  return !denial;
}
function view(session: PrivateMenu<ProfileMenu>) {
  const { userId, pending } = session.value;
  const control = (action: string, label: string, style = ButtonStyle.Secondary) =>
    new ButtonBuilder()
      .setCustomId(`guide_profile:${action}:${session.id}`)
      .setLabel(label)
      .setStyle(style);
  const embed = new EmbedBuilder().setTitle('Player Profiles').setColor(0xd6ad43);
  const picker = new UserSelectMenuBuilder()
    .setCustomId(`guide_profile:user:${session.id}`)
    .setPlaceholder('Choose a server member');
  if (userId) picker.setDefaultUsers(userId);
  const components: (ActionRowBuilder<UserSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>)[] =
    [];
  if (pending) {
    embed.setDescription(
      `Remove ${pending === 'clear' ? 'both linked identities' : pending === 'ra3b' ? 'RA3BattleNet' : 'Shatabrick'} for <@${userId}>? These identity links are shared across servers.`,
    );
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        control('confirm', 'Confirm Removal', ButtonStyle.Danger),
        control('back', 'Cancel'),
      ),
    );
  } else {
    embed.setDescription(
      userId
        ? `Selected member: <@${userId}>`
        : 'Choose a member to view their profile or manage linked identities.',
    );
    components.push(new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(picker));
    const actions = new ActionRowBuilder<ButtonBuilder>().addComponents(
      control('view', 'View Profile', ButtonStyle.Primary).setDisabled(!userId),
    );
    if (userId && (userId === session.ownerId || isOwner(session.ownerId))) {
      const user = userRepository.findByDiscordId(userId);
      actions.addComponents(
        control('shatabrick', 'Unlink Shatabrick').setDisabled(!user?.shatabrickUsername),
        control('ra3b', 'Unlink RA3BattleNet').setDisabled(
          !user?.ra3bUsername && !user?.ra3bPersonaId,
        ),
        control('clear', 'Clear Identities', ButtonStyle.Danger).setDisabled(
          !user?.shatabrickUsername && !user?.ra3bUsername && !user?.ra3bPersonaId,
        ),
      );
    } else if (userId)
      embed.setFooter({
        text: 'Only the profile owner or bot owner can remove shared identity links.',
      });
    components.push(actions);
  }
  return { content: null, embeds: [embed], components, allowedMentions: { parse: [] as [] } };
}
export async function openProfileAdminMenu(
  interaction: ChatInputCommandInteraction,
  userId?: string,
) {
  if (!(await authorize(interaction))) return;
  const session = sessions.create(interaction, { userId });
  await interaction.reply({ ...view(session), content: undefined, ephemeral: true });
}
export async function handleProfileAdminMenu(interaction: MenuInteraction) {
  const session = await sessions.resolve(interaction);
  if (!session) return;
  try {
    if (!(await authorize(interaction)) || interaction.isModalSubmit()) return;
    const action = interaction.customId.split(':')[1];
    if (action === 'user' && interaction.isUserSelectMenu()) {
      const member = await interaction
        .guild!.members.fetch(interaction.values[0])
        .catch(() => null);
      if (!member) {
        await interaction.reply({ content: 'Choose a member of this server.', ephemeral: true });
        return;
      }
      session.value = { userId: member.id };
      await interaction.update(view(session));
      return;
    }
    if (action === 'back') {
      session.value.pending = undefined;
      await interaction.update(view(session));
      return;
    }
    const userId = session.value.userId;
    if (!userId || !interaction.isButton()) return;
    const target = await interaction.guild!.members.fetch(userId).catch(() => null);
    if (!target) {
      await interaction.reply({ content: 'This member is no longer available.', ephemeral: true });
      return;
    }
    if (action === 'view') {
      session.busy = true;
      try {
        await applyProfileAction(interaction, 'view', target.user);
      } finally {
        session.busy = false;
      }
      return;
    }
    if (userId !== interaction.user.id && !isOwner(interaction.user.id)) {
      await interaction.reply({
        content: 'Only the profile owner or bot owner can remove shared identity links.',
        ephemeral: true,
      });
      return;
    }
    if (['shatabrick', 'ra3b', 'clear'].includes(action)) {
      session.value.pending = action as ProfileMenu['pending'];
      session.value.fingerprint = fingerprint(userId);
      await interaction.update(view(session));
      return;
    }
    if (action === 'confirm' && session.value.pending) {
      if (session.value.fingerprint !== fingerprint(userId)) {
        session.value.pending = undefined;
        await interaction.update({
          ...view(session),
          content: 'The linked profile changed. Review it before removing anything.',
        });
        return;
      }
      sessions.consume(session);
      await applyProfileAction(
        interaction,
        session.value.pending === 'clear' ? 'clear' : 'unlink',
        target.user,
        session.value.pending,
        true,
      );
    }
  } finally {
    session.busy = false;
  }
}
