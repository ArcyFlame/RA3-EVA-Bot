import {
  ActionRowBuilder,
  AnySelectMenuInteraction,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  Guild,
  ModalBuilder,
  ModalSubmitInteraction,
  RepliableInteraction,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  escapeMarkdown,
} from 'discord.js';
import {
  activityRankRepository,
  MAX_ACTIVITY_RANKS,
} from '../../repositories/activity-rank.repository';
import { guildRepository } from '../../repositories/guild.repository';
import { denyUnlessAdmin } from '../../utils/permissions';

type MenuRow = ActionRowBuilder<
  | ButtonBuilder
  | StringSelectMenuBuilder
  | RoleSelectMenuBuilder
  | ChannelSelectMenuBuilder
  | UserSelectMenuBuilder
>;
export type ActivityScreen =
  | 'main'
  | 'sources'
  | 'ranks'
  | 'rank'
  | 'role'
  | 'ping'
  | 'replay'
  | 'member'
  | 'members'
  | 'delete'
  | 'reset'
  | 'ratings'
  | 'scan';
export interface ActivityControl {
  action: string;
  ref: string;
  version: number;
  ownerId: string;
}

export function activityControlId(
  kind: 'btn' | 'sel' | 'modal',
  action: string,
  ref: string | number,
  version: number,
  ownerId: string,
): string {
  return ['activity_' + kind, action, ref, version, ownerId].join(':');
}

export function parseActivityControl(customId: string): ActivityControl | null {
  const match = /^activity_(?:btn|sel|modal):([a-z_]+):(\d+):(\d+):(\d{17,20})$/.exec(customId);
  if (!match || match[2].length > 20 || !Number.isSafeInteger(Number(match[3]))) return null;
  return { action: match[1], ref: match[2], version: Number(match[3]), ownerId: match[4] };
}

export async function authorizeActivityControl(
  interaction: RepliableInteraction & { customId: string },
): Promise<ActivityControl | null> {
  const control = parseActivityControl(interaction.customId);
  if (!control || control.ownerId !== interaction.user.id || !interaction.guild) {
    await interaction.reply({
      content: 'Open your own configuration menu with /activity admin.',
      ephemeral: true,
    });
    return null;
  }
  const member = await interaction.guild.members
    .fetch({ user: interaction.user.id, force: true })
    .catch(() => null);
  const denial = denyUnlessAdmin(member);
  if (denial) {
    await interaction.reply({ content: denial, ephemeral: true });
    return null;
  }
  try {
    activityRankRepository.assertVersion(interaction.guild.id, control.version);
  } catch (error) {
    await interaction.reply({ content: (error as Error).message, ephemeral: true });
    return null;
  }
  return control;
}

export function buildActivityAdminView(
  guild: Guild,
  userId: string,
  screen: ActivityScreen = 'main',
  ref: string | number = 0,
  notice?: string,
) {
  const settings = activityRankRepository.getSettings(guild.id);
  const ranks = activityRankRepository.getRankDefinitions(guild.id);
  const guildData = guildRepository.findByDiscordId(guild.id);
  const components: MenuRow[] = [];
  const embed = new EmbedBuilder().setTitle('🎖️ Activity Rank Configuration').setColor(0xd6ad43);
  const id = (kind: 'btn' | 'sel', action: string, target: string | number = 0) =>
    activityControlId(kind, action, target, settings.version, userId);
  const button = (
    action: string,
    label: string,
    target: string | number = 0,
    style = ButtonStyle.Secondary,
    disabled = false,
  ) =>
    new ButtonBuilder()
      .setCustomId(id('btn', action, target))
      .setLabel(label)
      .setStyle(style)
      .setDisabled(disabled);
  const row = (...buttons: ButtonBuilder[]) =>
    components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons));
  const back = () => row(button('main', 'Back to Settings'));

  if (screen === 'main') {
    const maxDays =
      settings.progressionMode === 'per_rank'
        ? ranks.length * settings.daysPerRank
        : settings.maxRankDays;
    embed
      .setDescription(
        'Choose what earns XP, configure progression, and manage the roles for each rank.',
      )
      .addFields(
        {
          name: 'System',
          value: guildData?.activityRanksEnabled === 1 ? '🟢 Enabled' : '🔴 Disabled',
          inline: true,
        },
        {
          name: 'Progression',
          value:
            settings.progressionMode === 'per_rank'
              ? settings.daysPerRank + ' ping days per rank\n' + maxDays + ' days to the top rank'
              : maxDays + ' ping days to the top rank',
          inline: true,
        },
        {
          name: 'Ranks & Levels',
          value: ranks.length + ' ranks · ' + settings.xpPerLevel + ' XP per level',
          inline: true,
        },
        {
          name: 'XP Sources',
          value:
            '📣 Daily ping: ' +
            (settings.pingEnabled ? settings.pingPoints + ' XP' : 'Off') +
            '\n📁 Replay uploads: ' +
            (settings.replayEnabled
              ? settings.replayPoints +
                ' XP per file, up to ' +
                settings.replayDailyCap +
                ' per day'
              : 'Off'),
        },
        {
          name: 'Counting Rules',
          value:
            'Pings count once per member per UTC day. Replay files in the selected channel are checked for the RA3 replay header. Reposts earn no extra credit. Ordinary chat earns no XP. Rank roles must not grant server permissions, staff privileges or channel access.',
        },
      );
    row(
      button(
        guildData?.activityRanksEnabled === 1 ? 'disable' : 'enable',
        guildData?.activityRanksEnabled === 1 ? 'Disable System' : 'Enable System',
        0,
        guildData?.activityRanksEnabled === 1 ? ButtonStyle.Danger : ButtonStyle.Success,
      ),
      button('sources', 'XP Sources'),
      button('xp', 'XP & Levels'),
      button('days', 'Days & Progression'),
    );
    row(
      button('ranks', 'Manage Ranks'),
      button('members', 'Manage Member XP'),
      button('sync', 'Sync Rank Roles'),
    );
    if (guildData?.game === 'genevo') row(button('ratings', 'Replay Ratings'));
  } else if (screen === 'ratings' || screen === 'scan') {
    if (guildData?.game !== 'genevo')
      throw new Error('Replay ratings are available only in GenEvo setup.');
    embed
      .setTitle('🎬 GenEvo Replay Ratings')
      .setDescription(
        'Each accepted replay gets its own card with 👍 and 👎 reactions. Original uploads stay intact.\n\n' +
          'Only human server members can vote, with one active vote each. Self-votes and duplicate files earn nothing. Downvotes reduce future bonuses, not XP already earned.',
      )
      .addFields(
        {
          name: 'Rating XP',
          value: `${settings.ratingsEnabled ? '🟢 Enabled' : '🔴 Disabled'}\n${settings.ratingPoints} XP per net positive vote, starting at ${settings.ratingMinVotes} net votes\nUp to ${settings.ratingReplayCap} XP per replay and ${settings.ratingDailyCap} XP per uploader per UTC day`,
        },
        {
          name: 'Voters & Channel',
          value: `Accounts must be at least ${settings.ratingAccountDays} days old.\nReplay channel: <#${settings.replayChannelId}>`,
        },
        {
          name: 'Required Bot Permissions',
          value:
            'View Channel, Send Messages, Embed Links, Read Message History and Add Reactions.',
        },
      );
    if (screen === 'scan') {
      embed.addFields({
        name: 'Scan Recent Uploads?',
        value:
          'Check the last 100 messages from the past 30 days. Create at most 10 missing cards per run and inspect at most 20 files. Historical uploads do not receive upload XP. Scans have a 10-minute cooldown.',
      });
      row(
        button('scan_confirm', 'Create Missing Cards', 0, ButtonStyle.Primary),
        button('ratings', 'Cancel'),
      );
    } else {
      row(
        button('toggle_ratings', settings.ratingsEnabled ? 'Disable Ratings' : 'Enable Ratings'),
        button('rating_xp', 'Rating XP & Limits'),
        button('scan', 'Scan Recent Uploads'),
      );
    }
    back();
  } else if (screen === 'sources') {
    embed
      .setDescription('Select the ping role and replay channel, and enable the sources you want.')
      .addFields(
        {
          name: '📣 Ping',
          value:
            (settings.pingEnabled ? 'Enabled' : 'Disabled') +
            '\nRole: ' +
            (guildData?.cncPingRoleId ? '<@&' + guildData.cncPingRoleId + '>' : 'Not selected'),
          inline: true,
        },
        {
          name: '📁 Replay Uploads',
          value:
            (settings.replayEnabled ? 'Enabled' : 'Disabled') +
            '\nChannel: <#' +
            settings.replayChannelId +
            '>',
          inline: true,
        },
      );
    row(
      button('toggle_ping', settings.pingEnabled ? 'Disable Ping XP' : 'Enable Ping XP'),
      button('ping', 'Choose Ping Role'),
      button('clear_ping', 'Clear Ping Role'),
    );
    row(
      button('toggle_replay', settings.replayEnabled ? 'Disable Replay XP' : 'Enable Replay XP'),
      button('replay', 'Choose Replay Channel'),
    );
    back();
  } else if (screen === 'ranks') {
    const page = Math.max(
      0,
      Math.min(Math.floor(Number(ref)), Math.max(0, Math.ceil(ranks.length / 25) - 1)),
    );
    const visible = ranks.slice(page * 25, page * 25 + 25);
    embed
      .setDescription(
        visible.length
          ? visible
              .map(
                (rank) =>
                  '**' +
                  rank.rank +
                  '. ' +
                  escapeMarkdown(rank.title) +
                  '** - ' +
                  rank.threshold.toLocaleString() +
                  ' XP' +
                  (rank.roleId ? ' · <@&' + rank.roleId + '>' : ' · No role'),
              )
              .join('\n')
              .slice(0, 4000)
          : 'No ranks configured. Add a rank to get started.',
      )
      .setFooter({
        text:
          'Page ' +
          (page + 1) +
          '/' +
          Math.max(1, Math.ceil(ranks.length / 25)) +
          ' · Adding/removing ranks recalculates the schedule. Use Sync Rank Roles to apply changes.',
      });
    if (visible.length)
      components.push(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(id('sel', 'rank'))
            .setPlaceholder('Select a rank to edit')
            .addOptions(
              visible.map((rank) => ({
                label: (rank.rank + '. ' + rank.title).slice(0, 100),
                value: String(rank.id),
                description: rank.threshold.toLocaleString() + ' XP',
              })),
            ),
        ),
      );
    row(
      button('add', 'Add Rank', 0, ButtonStyle.Success, ranks.length >= MAX_ACTIVITY_RANKS),
      button('ranks', 'Previous', Math.max(0, page - 1), ButtonStyle.Secondary, page === 0),
      button('ranks', 'Next', page + 1, ButtonStyle.Secondary, (page + 1) * 25 >= ranks.length),
    );
    back();
  } else if (screen === 'rank' || screen === 'role' || screen === 'delete') {
    const rank = ranks.find((entry) => entry.id === Number(ref));
    if (!rank)
      return buildActivityAdminView(guild, userId, 'ranks', 0, 'This rank no longer exists.');
    embed
      .setTitle('🎖️ Rank ' + rank.rank + ' · ' + rank.title)
      .setDescription(
        'Required XP: **' +
          rank.threshold.toLocaleString() +
          '**\nPing days at the current rate: **' +
          Math.ceil(rank.threshold / settings.pingPoints) +
          '**\nRole: ' +
          (rank.roleId ? '<@&' + rank.roleId + '>' : 'Not selected'),
      );
    if (screen === 'delete') {
      embed.addFields({
        name: 'Remove this rank?',
        value:
          'The Discord role will remain in the server. Sync Rank Roles afterwards to remove obsolete rank assignments from tracked members.',
      });
      row(
        button('delete_confirm', 'Remove Rank', rank.id, ButtonStyle.Danger),
        button('rank', 'Cancel', rank.id),
      );
    } else if (screen === 'role') {
      embed.addFields({
        name: 'Select a role',
        value:
          'Choose a cosmetic role with no server permissions, staff privileges or channel grants. The bot role must be above it.',
      });
      components.push(
        new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
          new RoleSelectMenuBuilder()
            .setCustomId(id('sel', 'role', rank.id))
            .setPlaceholder('Choose an existing rank role'),
        ),
      );
      row(button('rank', 'Back to Rank', rank.id));
    } else {
      row(
        button('edit', 'Edit Name / XP', rank.id),
        button('role', 'Choose Existing Role', rank.id),
        button('create', 'Create Discord Role', rank.id, ButtonStyle.Success, !!rank.roleId),
      );
      row(
        button('up', 'Move Up', rank.id, ButtonStyle.Secondary, rank.rank === 1),
        button('down', 'Move Down', rank.id, ButtonStyle.Secondary, rank.rank === ranks.length),
        button('detach', 'Unlink Role', rank.id, ButtonStyle.Secondary, !rank.roleId),
        button('delete', 'Remove Rank', rank.id, ButtonStyle.Danger),
      );
      row(button('ranks', 'Back to Ranks', Math.floor((rank.rank - 1) / 25)));
    }
  } else if (screen === 'ping') {
    embed.setDescription('Choose the C&C role whose ping earns credit once per UTC day.');
    components.push(
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId(id('sel', 'ping'))
          .setPlaceholder('Choose the ping role'),
      ),
    );
    row(button('sources', 'Back to Sources'));
  } else if (screen === 'replay') {
    embed.setDescription('Only .RA3Replay file attachments in this channel earn replay XP.');
    components.push(
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(id('sel', 'replay'))
          .setPlaceholder('Choose the replay channel')
          .addChannelTypes(ChannelType.GuildText),
      ),
    );
    row(button('sources', 'Back to Sources'));
  } else if (screen === 'members') {
    embed.setDescription('Choose a member to inspect, adjust, or reset their XP.');
    components.push(
      new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
        new UserSelectMenuBuilder()
          .setCustomId(id('sel', 'member'))
          .setPlaceholder('Choose a server member'),
      ),
    );
    back();
  } else if (screen === 'member' || screen === 'reset') {
    const activity = activityRankRepository.getMember(guild.id, String(ref));
    embed.setDescription(
      'Member: <@' +
        ref +
        '>\nXP: **' +
        (activity?.points ?? 0).toLocaleString() +
        '** · Level **' +
        Math.floor((activity?.points ?? 0) / settings.xpPerLevel) +
        '**\nDaily pings: **' +
        (activity?.qualifyingCncPings ?? 0) +
        '** · Replays: **' +
        (activity?.qualifyingReplays ?? 0) +
        '**',
    );
    if (screen === 'reset')
      row(
        button('reset_confirm', 'Confirm Reset', ref, ButtonStyle.Danger),
        button('member', 'Cancel', ref),
      );
    else
      row(
        button('adjust', 'Adjust XP', ref),
        button('reset', 'Reset Member', ref, ButtonStyle.Danger),
        button('members', 'Choose Another Member'),
      );
    back();
  }
  return {
    content: notice ? notice.slice(0, 1900) : '',
    embeds: [embed],
    components,
    allowedMentions: { parse: [] as [] },
  };
}

export function activityModal(
  action: string,
  ref: string,
  version: number,
  ownerId: string,
  title: string,
  fields: Array<{ id: string; label: string; value?: string; required?: boolean }>,
): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(activityControlId('modal', action, ref, version, ownerId))
    .setTitle(title)
    .addComponents(
      fields.map((field) => {
        const input = new TextInputBuilder()
          .setCustomId(field.id)
          .setLabel(field.label)
          .setStyle(TextInputStyle.Short)
          .setRequired(field.required !== false)
          .setMaxLength(field.id === 'name' ? 80 : 12);
        if (field.value) input.setValue(field.value);
        return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
      }),
    );
}

export type ActivityInteraction =
  | ButtonInteraction
  | AnySelectMenuInteraction
  | ModalSubmitInteraction;

export async function replyActivityError(
  interaction: ActivityInteraction,
  error: unknown,
): Promise<void> {
  const content =
    error instanceof Error ? error.message : 'The activity settings could not be saved.';
  if (interaction.deferred || interaction.replied)
    await interaction.followUp({ content, ephemeral: true, allowedMentions: { parse: [] } });
  else await interaction.reply({ content, ephemeral: true, allowedMentions: { parse: [] } });
}
