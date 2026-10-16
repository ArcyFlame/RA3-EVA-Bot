import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  ButtonInteraction,
  ChatInputCommandInteraction,
  StringSelectMenuInteraction,
  GuildMember,
  PermissionFlagsBits,
  escapeMarkdown,
  MessageFlags,
} from 'discord.js';
import { guildRepository } from '../../repositories/guild.repository';
import { activityRankRepository } from '../../repositories/activity-rank.repository';
import {
  replayRatingRepository,
  ReplayRatingCard,
} from '../../repositories/replay-rating.repository';
import { appSettingsRepository } from '../../repositories/app-settings.repository';
import { isAdmin } from '../../utils/permissions';
import { replayMedal } from '../../utils/replay-medals';

type LibraryInteraction =
  | ChatInputCommandInteraction
  | ButtonInteraction
  | StringSelectMenuInteraction;
interface LibraryAccess {
  guildId: string;
  channelId: string;
  member: GuildMember;
}

export async function replayLibraryAccess(
  interaction: LibraryInteraction,
): Promise<LibraryAccess | null> {
  const guild = interaction.guild;
  if (!guild || guildRepository.findByDiscordId(guild.id)?.game !== 'genevo') return null;
  const channelId = activityRankRepository.getSettings(guild.id).replayChannelId;
  const [channel, member] = await Promise.all([
    guild.channels.fetch(channelId).catch(() => null),
    guild.members.fetch({ user: interaction.user.id, force: true }).catch(() => null),
  ]);
  if (
    !member ||
    !channel ||
    channel.guildId !== guild.id ||
    !channel.isTextBased() ||
    !channel
      .permissionsFor(member)
      ?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory])
  )
    return null;
  return { guildId: guild.id, channelId, member };
}

export function replayLibraryView(
  access: LibraryAccess,
  scope: 'top' | 'mine' | 'all' = 'top',
  offset = 0,
) {
  const { guildId, channelId, member } = access;
  const staff = isAdmin(member);
  if (scope === 'all' && !staff)
    throw new Error('Only server admins can manage other members’ replays.');
  const embed = new EmbedBuilder()
    .setColor(0xd6ad43)
    .setTitle(
      scope === 'top'
        ? '🏆 Top 10 GenEvo Replays'
        : scope === 'mine'
          ? 'My Replays'
          : 'Manage Server Replays',
    );
  const controls: Array<
    ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>
  > = [];
  const button = (mode: string, label: string, page = 0) =>
    new ButtonBuilder()
      .setCustomId(`replay_library:${mode}:${page}:${member.id}`)
      .setLabel(label)
      .setStyle(ButtonStyle.Secondary);
  const navigation = new ActionRowBuilder<ButtonBuilder>().addComponents(
    button('top', 'Top 10'),
    button('mine', 'My Replays'),
    new ButtonBuilder()
      .setLabel('Open Replay Channel')
      .setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/channels/${guildId}/${channelId}`),
  );
  if (staff) navigation.addComponents(button('all', 'Manage Server Replays'));
  if (scope === 'top') {
    const cards = replayRatingRepository.leaderboard(guildId, channelId);
    const both = activityRankRepository.getSettings(guildId).ratingMode === 'both';
    const limits = appSettingsRepository.getReplayMedals(guildId);
    embed.setDescription(
      cards.length
        ? 'Ranked by unique qualifying votes in this server.'
        : 'No archived replays yet.',
    );
    cards.forEach((card, index) =>
      embed.addFields({
        name: `${index + 1}. ${replayMedal(card.score, guildId) || `Replay #${card.id}`}`,
        value:
          `[${escapeMarkdown(card.filename)}](https://discord.com/channels/${guildId}/${channelId}/${card.card_message_id})\n` +
          `<@${card.user_id}> - 👍 ${card.up}${both ? ` | 👎 ${card.down} | Score ${card.score}` : ''}`,
      }),
    );
    embed.setFooter({
      text: `Bronze ${limits.bronze} | Silver ${limits.silver} | Gold ${limits.gold} | Diamond ${limits.diamond}`,
    });
  } else {
    const cards = replayRatingRepository.library(
      guildId,
      channelId,
      scope === 'mine' ? member.id : undefined,
      offset,
    );
    embed.setDescription(
      cards.length
        ? 'Choose a replay to edit or remove. Only you can see these controls.'
        : 'No replays on this page.',
    );
    if (cards.length)
      controls.push(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`replay_select:${member.id}`)
            .setPlaceholder('Choose a replay')
            .addOptions(
              cards.slice(0, 25).map((card) => ({
                label: `#${card.id} ${card.filename}`.slice(0, 100),
                value: String(card.id),
              })),
            ),
        ),
      );
    if (offset > 0 || cards.length > 25)
      controls.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          button(scope, 'Previous', Math.max(0, offset - 25)).setDisabled(offset === 0),
          button(scope, 'Next', offset + 25).setDisabled(cards.length <= 25 || offset >= 10000),
        ),
      );
  }
  controls.push(navigation);
  return { embeds: [embed], components: controls, allowedMentions: { parse: [] as [] } };
}

export async function navigateReplayLibrary(interaction: ButtonInteraction) {
  const match = /^replay_library:(top|mine|all):(\d+):(\d{17,20})$/.exec(interaction.customId);
  if (
    !match ||
    match[3] !== interaction.user.id ||
    !interaction.message.flags.has(MessageFlags.Ephemeral)
  ) {
    await interaction.reply({ content: 'Open your own private /replays menu.', ephemeral: true });
    return;
  }
  await interaction.deferUpdate();
  const access = await replayLibraryAccess(interaction);
  const offset = Number(match[2]);
  if (
    !access ||
    !Number.isSafeInteger(offset) ||
    offset > 10000 ||
    (match[1] === 'all' && !isAdmin(access.member))
  ) {
    await interaction.editReply({
      content: 'This replay menu is unavailable.',
      embeds: [],
      components: [],
    });
    return;
  }
  await interaction.editReply({
    ...replayLibraryView(access, match[1] as 'top' | 'mine' | 'all', offset),
    content: null,
  });
}

export async function selectReplay(interaction: StringSelectMenuInteraction) {
  if (
    interaction.customId !== `replay_select:${interaction.user.id}` ||
    !interaction.message.flags.has(MessageFlags.Ephemeral)
  ) {
    await interaction.reply({ content: 'Open your own private /replays menu.', ephemeral: true });
    return;
  }
  await interaction.deferUpdate();
  const access = await replayLibraryAccess(interaction);
  const id = /^\d+$/.test(interaction.values[0] ?? '') ? Number(interaction.values[0]) : NaN;
  const card = Number.isSafeInteger(id) ? replayRatingRepository.get(id) : undefined;
  if (
    !access ||
    !card ||
    card.closed ||
    card.guild_id !== access.guildId ||
    card.channel_id !== access.channelId ||
    !card.card_message_id ||
    !card.archive_attachment_id ||
    (card.user_id !== interaction.user.id && !isAdmin(access.member))
  ) {
    await interaction.editReply({
      content: 'You cannot manage this replay.',
      embeds: [],
      components: [],
    });
    return;
  }
  await interaction.editReply(
    replayManagementView(card, interaction.user.id, isAdmin(access.member)),
  );
}

/** Public entry point; the actual management controls are always an ephemeral reply. */
export async function openReplayOptions(interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const match = /^replay_options:(\d+)$/.exec(interaction.customId);
  const id = match ? Number(match[1]) : NaN;
  const card = Number.isSafeInteger(id) ? replayRatingRepository.get(id) : undefined;
  const access = await replayLibraryAccess(interaction);
  if (
    !access ||
    !card ||
    card.closed ||
    card.guild_id !== access.guildId ||
    card.channel_id !== access.channelId ||
    card.channel_id !== interaction.channelId ||
    card.card_message_id !== interaction.message.id ||
    interaction.message.author.id !== interaction.client.user.id ||
    !card.archive_attachment_id
  ) {
    await interaction.editReply({ content: 'This replay is unavailable.', components: [] });
    return;
  }
  if (card.user_id !== interaction.user.id && !isAdmin(access.member)) {
    await interaction.editReply({
      content:
        'Only the uploader or server admins can edit or remove this replay. Use /replays to manage your own uploads.',
      components: [],
    });
    return;
  }
  await interaction.editReply(
    replayManagementView(card, interaction.user.id, isAdmin(access.member)),
  );
}

function replayManagementView(card: ReplayRatingCard, actorId: string, staff: boolean) {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('Edit Replay')
      .setStyle(ButtonStyle.Secondary)
      .setCustomId(`replay_manage:edit:${card.id}:${card.revision ?? 0}:${actorId}`),
    new ButtonBuilder()
      .setLabel('Remove Replay')
      .setStyle(ButtonStyle.Danger)
      .setCustomId(`replay_manage:remove:${card.id}:${card.revision ?? 0}:${actorId}`),
    new ButtonBuilder()
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary)
      .setCustomId(`replay_library:${staff ? 'all' : 'mine'}:0:${actorId}`),
  );
  return {
    content: null,
    embeds: [
      new EmbedBuilder()
        .setColor(0xd6ad43)
        .setTitle(`Replay #${card.id}`)
        .setDescription(
          `**${escapeMarkdown(card.filename)}**\nUploaded by <@${card.user_id}>\n` +
            `[Open replay](https://discord.com/channels/${card.guild_id}/${card.channel_id}/${card.card_message_id})`,
        ),
    ],
    components: [row],
    allowedMentions: { parse: [] as [] },
  };
}
