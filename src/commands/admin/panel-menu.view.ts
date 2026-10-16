import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  TextChannel,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import {
  MenuInteraction,
  PrivateMenu,
  PrivateMenuSessions,
} from '../../utils/private-menu-session';
import { denyUnlessAdmin } from '../../utils/permissions';
import { applyStatsPanel } from './stats-panel.command';
import { applyMatchPanel } from './match-panel.command';
import { applyLobbyPanel } from './lobby-panel.command';
import { guildRepository } from '../../repositories/guild.repository';

type PanelKind = 'stats' | 'matches' | 'lobby';
interface PanelMenu {
  kind: PanelKind;
  channelId?: string;
}
const sessions = new PrivateMenuSessions<PanelMenu>();

async function authorize(interaction: ChatInputCommandInteraction | MenuInteraction) {
  const member = await interaction.guild?.members
    .fetch({ user: interaction.user.id, force: true })
    .catch(() => null);
  const denial = denyUnlessAdmin(member ?? null);
  if (denial) await interaction.reply({ content: denial, ephemeral: true });
  return !denial;
}

function view(session: PrivateMenu<PanelMenu>) {
  const { kind, channelId } = session.value;
  const picker = new ChannelSelectMenuBuilder()
    .setCustomId(`guide_panel:channel:${session.id}`)
    .setPlaceholder('Choose the panel channel')
    .addChannelTypes(ChannelType.GuildText);
  if (channelId) picker.setDefaultChannels(channelId);
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0xd6ad43)
        .setTitle(`${kind[0].toUpperCase() + kind.slice(1)} Panel`)
        .setDescription(
          channelId
            ? `Create or move the panel to <#${channelId}>?`
            : 'Choose a channel, then press Create Panel.',
        ),
    ],
    components: [
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(picker),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`guide_panel:save:${session.id}`)
          .setLabel('Create Panel')
          .setStyle(ButtonStyle.Success)
          .setDisabled(!channelId),
        new ButtonBuilder()
          .setCustomId(`guide_panel:cancel:${session.id}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
    allowedMentions: { parse: [] as [] },
  };
}

export async function openPanelMenu(interaction: ChatInputCommandInteraction, kind: PanelKind) {
  if (!(await authorize(interaction))) return;
  const session = sessions.create(interaction, { kind });
  await interaction.reply({ ...view(session), ephemeral: true });
}

export async function handlePanelMenu(bot: RA3Bot, interaction: MenuInteraction) {
  const session = await sessions.resolve(interaction);
  if (!session) return;
  try {
    if (!(await authorize(interaction))) return;
    if (interaction.isModalSubmit()) return;
    const action = interaction.customId.split(':')[1];
    if (action === 'cancel') {
      sessions.consume(session);
      await interaction.update({ content: 'Panel setup cancelled.', embeds: [], components: [] });
      return;
    }
    if (action === 'channel' && interaction.isChannelSelectMenu()) {
      const channel = await interaction
        .guild!.channels.fetch(interaction.values[0])
        .catch(() => null);
      const member = await interaction.guild!.members.fetch({
        user: interaction.user.id,
        force: true,
      });
      if (
        !channel ||
        channel.type !== ChannelType.GuildText ||
        channel.guildId !== session.guildId ||
        !channel.permissionsFor(member)?.has('ViewChannel')
      ) {
        await interaction.reply({
          content: 'Choose an accessible text channel in this server.',
          ephemeral: true,
        });
        return;
      }
      session.value.channelId = channel.id;
      await interaction.update(view(session));
      return;
    }
    if (action !== 'save' || !interaction.isButton() || !session.value.channelId) return;
    session.busy = true;
    const { kind, channelId } = session.value;
    const settings = guildRepository.findByDiscordId(session.guildId);
    if (
      (kind === 'matches' && settings?.tournamentsEnabled === 0) ||
      (kind === 'lobby' && settings?.lobbyEnabled === 0)
    ) {
      session.busy = false;
      await interaction.reply({
        content: 'Enable this feature in /toggle before creating its panel.',
        ephemeral: true,
      });
      return;
    }
    const channel = await interaction.guild!.channels.fetch(channelId).catch(() => null);
    sessions.consume(session);
    const apply = { stats: applyStatsPanel, matches: applyMatchPanel, lobby: applyLobbyPanel }[
      kind
    ];
    await apply(
      bot,
      interaction,
      'set',
      channel?.type === ChannelType.GuildText ? (channel as TextChannel) : null,
    );
  } finally {
    session.busy = false;
  }
}
