import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  escapeMarkdown,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import {
  MenuInteraction,
  PrivateMenu,
  PrivateMenuSessions,
} from '../../utils/private-menu-session';
import { isOwner, isTournamentStaff } from '../../utils/permissions';
import { canManageTournament } from '../../utils/tournament-access';
import { guildRepository } from '../../repositories/guild.repository';
import { tournamentRepository } from '../../repositories/tournament.repository';
import { tournamentAccessRepository } from '../../repositories/tournament-access.repository';
import { listTournamentContexts } from '../../services/tournament-context.service';
import { associateParticipant } from '../admin/tournament-participant.command';
import { assignOrganizer } from '../admin/tournament-organizer.command';
import { buildCheckinBoard } from './checkin.utils';
import { FACTION_MATCHUPS, GENEVO_FACTION_MATCHUPS, submitScore } from './report-score.command';

type Mode = 'participant' | 'organizer' | 'checkin' | 'report';
interface TournamentMenu {
  mode: Mode;
  eventId?: number;
  userId?: string;
  playerId?: number;
  serverId?: string;
  organizerBefore?: string;
  factions?: string;
  score?: string;
  page: number;
  revoke?: boolean;
}
type Session = PrivateMenu<TournamentMenu>;
type Row =
  | ActionRowBuilder<ButtonBuilder>
  | ActionRowBuilder<StringSelectMenuBuilder>
  | ActionRowBuilder<UserSelectMenuBuilder>;
const sessions = new PrivateMenuSessions<TournamentMenu>();
const titles: Record<Mode, string> = {
  participant: 'Verify Tournament Player',
  organizer: 'Tournament Organizer',
  checkin: 'Tournament Check-In',
  report: 'Report Tournament Score',
};

async function authorize(interaction: ChatInputCommandInteraction | MenuInteraction, mode: Mode) {
  const member = await interaction.guild?.members
    .fetch({ user: interaction.user.id, force: true })
    .catch(() => null);
  let denial: string | undefined;
  if (!member) denial = 'Open this menu inside a server.';
  else if (mode === 'organizer' && !isOwner(member.id))
    denial = 'Only the bot owner can assign tournament organizers.';
  else if (mode === 'participant' && !isTournamentStaff(member))
    denial = 'Only organizer staff can verify players.';
  else if (
    (mode === 'report' || mode === 'checkin') &&
    guildRepository.findByDiscordId(member.guild.id)?.tournamentsEnabled === 0
  )
    denial = 'Tournaments are disabled on this server.';
  if (denial) {
    await interaction.reply({ content: denial, ephemeral: true });
    return null;
  }
  return member!;
}

function events(session: Session, member: GuildMember) {
  const game = guildRepository.findByDiscordId(session.guildId)?.game ?? 'ra3';
  return listTournamentContexts(game).filter((event) => {
    if (session.value.mode === 'organizer') return true;
    if (session.value.mode === 'participant') return canManageTournament(member, event.id);
    return (
      event.status !== 'ended' && tournamentAccessRepository.organizer(event.id) === session.guildId
    );
  });
}

function players(session: Session) {
  return tournamentRepository
    .getParticipants(session.value.eventId!)
    .filter(
      (player) =>
        session.value.mode !== 'report' ||
        (player.checkedIn === 1 && player.discordId !== session.ownerId),
    );
}

function organizerServers(bot: RA3Bot, session: Session) {
  const game = guildRepository.findByDiscordId(session.guildId)?.game ?? 'ra3';
  const current = session.value.eventId
    ? tournamentAccessRepository.organizer(session.value.eventId)
    : undefined;
  return [...bot.client.guilds.cache.values()]
    .filter((guild) => {
      const settings = guildRepository.findByDiscordId(guild.id);
      return (
        settings?.game === game &&
        settings.tournamentsEnabled === 1 &&
        (guild.id === session.guildId ||
          guild.id === current ||
          !!settings.tournamentEventsChannelId)
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function view(bot: RA3Bot, session: Session, member: GuildMember) {
  const state = session.value;
  const id = (action: string) => `guide_tournament:${action}:${session.id}`;
  const button = (action: string, label: string, style = ButtonStyle.Secondary) =>
    new ButtonBuilder().setCustomId(id(action)).setLabel(label).setStyle(style);
  const embed = new EmbedBuilder().setColor(0xd6ad43).setTitle(titles[state.mode]);
  const components: Row[] = [];
  const navigation: ButtonBuilder[] = [];
  const select = (
    action: string,
    placeholder: string,
    entries: Array<{ label: string; value: string; description?: string }>,
    selected?: string,
  ) => {
    const maxPage = Math.max(0, Math.ceil(entries.length / 25) - 1);
    state.page = Math.max(0, Math.min(state.page, maxPage));
    if (entries.length)
      components.push(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(id(action))
            .setPlaceholder(placeholder)
            .addOptions(
              entries.slice(state.page * 25, state.page * 25 + 25).map((entry) => ({
                ...entry,
                label: entry.label.slice(0, 100),
                default: entry.value === selected,
              })),
            ),
        ),
      );
    if (maxPage > 0)
      navigation.push(
        button('previous', 'Previous').setDisabled(state.page === 0),
        button('next', 'Next').setDisabled(state.page >= maxPage),
      );
  };
  if (!state.eventId) {
    const choices = events(session, member);
    embed.setDescription(
      choices.length
        ? 'Choose a tournament to continue.'
        : 'No available tournaments for this server. An organizer must configure the event first.',
    );
    select(
      'event',
      'Choose a tournament',
      choices.map((event) => ({ label: event.title, value: String(event.id) })),
    );
    navigation.push(button('cancel', 'Close'));
  } else {
    const event = events(session, member).find((candidate) => candidate.id === state.eventId);
    if (!event) {
      state.eventId = undefined;
      state.page = 0;
      return view(bot, session, member);
    }
    embed.setDescription(`**${escapeMarkdown(event.title)}**`);
    if (state.mode === 'checkin') {
      embed.addFields({
        name: 'Check-In',
        value:
          'Open the board to check in or cancel. Organizer staff also get registration controls.',
      });
      navigation.push(button('open', 'Open Check-In', ButtonStyle.Success));
    } else if (state.mode === 'organizer') {
      const current = tournamentAccessRepository.organizer(event.id);
      embed.addFields({
        name: 'Current organizer',
        value: current ? (bot.client.guilds.cache.get(current)?.name ?? current) : 'Not assigned',
      });
      if (state.revoke) {
        embed.addFields({
          name: 'Remove authorization?',
          value:
            'The server will lose tournament management access. Any bracket write authorization will also be cleared.',
        });
        navigation.push(
          button('confirmrevoke', 'Confirm Removal', ButtonStyle.Danger),
          button('back', 'Cancel'),
        );
      } else {
        select(
          'server',
          'Choose organizer server',
          organizerServers(bot, session).map((guild) => ({
            label: guild.name || guild.id,
            value: guild.id,
            description: `${guild.id}${guild.id === session.guildId ? ' - This server' : ''}`,
          })),
          state.serverId,
        );
        embed.addFields({
          name: 'Eligible servers',
          value:
            'This server and configured tournament servers for this game. Enable tournaments and select a Tournament News channel in /bot setup to include another server.',
        });
        if (state.serverId)
          embed.addFields({
            name: 'Selected server',
            value: bot.client.guilds.cache.get(state.serverId)?.name ?? 'Unavailable',
          });
        navigation.push(
          button('assign', 'Assign Organizer', ButtonStyle.Success).setDisabled(!state.serverId),
          button('revoke', 'Remove Organizer', ButtonStyle.Danger).setDisabled(!current),
        );
      }
    } else {
      if (state.mode === 'participant') {
        const picker = new UserSelectMenuBuilder()
          .setCustomId(id('member'))
          .setPlaceholder('Choose the Discord member');
        if (state.userId) picker.setDefaultUsers(state.userId);
        components.push(new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(picker));
      }
      const choices = players(session);
      const selected = choices.find((player) => player.id === state.playerId);
      select(
        'player',
        state.mode === 'report' ? 'Choose your opponent' : 'Choose the registered player',
        choices.map((player) => ({ label: player.name, value: String(player.id) })),
        state.playerId ? String(state.playerId) : undefined,
      );
      if (!choices.length)
        embed.addFields({
          name: 'Players',
          value:
            state.mode === 'report'
              ? 'No other checked-in players are available.'
              : 'No registered players were found for this event.',
        });
      if (state.mode === 'participant') {
        if (state.userId && selected)
          embed.addFields({
            name: 'Association to confirm',
            value: `${escapeMarkdown(selected.name)} = <@${state.userId}>`,
          });
        navigation.push(
          button('associate', 'Confirm Association', ButtonStyle.Success).setDisabled(
            !state.userId || !selected,
          ),
        );
      } else {
        const genevo = guildRepository.findByDiscordId(session.guildId)?.game === 'genevo';
        const labels: Record<string, string> = genevo
          ? { U: 'USA', C: 'China', G: 'GLA' }
          : { S: 'Soviets', A: 'Allies', E: 'Empire' };
        components.push(
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(id('factions'))
              .setPlaceholder('Your faction vs opponent faction')
              .addOptions(
                (genevo ? GENEVO_FACTION_MATCHUPS : FACTION_MATCHUPS).map((matchup) => ({
                  label: `${labels[matchup[0]]} vs ${labels[matchup[2]]}`,
                  value: matchup,
                  default: state.factions === matchup,
                })),
              ),
          ),
        );
        embed.addFields({
          name: 'Result to submit',
          value: `Opponent: ${selected ? escapeMarkdown(selected.name) : 'Choose above'}\nFactions: ${state.factions ?? 'Choose above'}\nScore (you first): ${state.score ?? 'Press Enter Score'}`,
        });
        navigation.push(
          button('score', 'Enter Score'),
          button('submit', 'Submit for Review', ButtonStyle.Success).setDisabled(
            !selected || !state.factions || !state.score,
          ),
        );
      }
    }
    navigation.push(button('events', 'Change Tournament'));
  }
  // A report page can have pagination plus three actions: at most five buttons.
  components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...navigation));
  return { content: null, embeds: [embed], components, allowedMentions: { parse: [] as [] } };
}

export async function openTournamentMenu(
  bot: RA3Bot,
  interaction: ChatInputCommandInteraction,
  mode: Mode,
  eventId?: number,
  userId?: string,
) {
  const member = await authorize(interaction, mode);
  if (!member) return;
  const session = sessions.create(interaction, {
    mode,
    eventId,
    userId,
    page: 0,
    organizerBefore: eventId ? tournamentAccessRepository.organizer(eventId) : undefined,
  });
  await interaction.reply({ ...view(bot, session, member), content: undefined, ephemeral: true });
}

export async function handleTournamentMenu(bot: RA3Bot, interaction: MenuInteraction) {
  const session = await sessions.resolve(interaction);
  if (!session) return;
  session.busy = true;
  try {
    const member = await authorize(interaction, session.value.mode);
    if (!member) return;
    const action = interaction.customId.split(':')[1];
    const state = session.value;
    if (action === 'cancel' && !interaction.isModalSubmit()) {
      sessions.consume(session);
      await interaction.update({ content: 'Menu closed.', embeds: [], components: [] });
      return;
    }
    if (action === 'events') {
      session.value = { mode: state.mode, page: 0 };
    } else if (action === 'previous') state.page = Math.max(0, state.page - 1);
    else if (action === 'next') state.page = Math.min(10000, state.page + 1);
    else if (action === 'event' && interaction.isStringSelectMenu()) {
      const event = events(session, member).find(
        (candidate) => String(candidate.id) === interaction.values[0],
      );
      if (!event) throw new Error('This tournament is no longer available to you.');
      session.value = {
        mode: state.mode,
        eventId: event.id,
        page: 0,
        organizerBefore: tournamentAccessRepository.organizer(event.id),
      };
    } else {
      const event = events(session, member).find((candidate) => candidate.id === state.eventId);
      if (!event) throw new Error('This tournament is no longer available to you.');
      if (action === 'member' && state.mode === 'participant' && interaction.isUserSelectMenu()) {
        const target = await interaction
          .guild!.members.fetch(interaction.values[0])
          .catch(() => null);
        if (!target || target.user.bot) throw new Error('Choose a human member of this server.');
        state.userId = target.id;
      } else if (
        action === 'player' &&
        ['participant', 'report'].includes(state.mode) &&
        interaction.isStringSelectMenu()
      ) {
        const player = players(session).find(
          (candidate) => String(candidate.id) === interaction.values[0],
        );
        if (!player) throw new Error('This player is no longer available.');
        state.playerId = player.id;
      } else if (
        action === 'server' &&
        state.mode === 'organizer' &&
        interaction.isStringSelectMenu()
      ) {
        if (!organizerServers(bot, session).some((guild) => guild.id === interaction.values[0]))
          throw new Error('Choose a configured tournament server for this game.');
        state.serverId = interaction.values[0];
      } else if (
        action === 'factions' &&
        state.mode === 'report' &&
        interaction.isStringSelectMenu()
      ) {
        const choices =
          guildRepository.findByDiscordId(session.guildId)?.game === 'genevo'
            ? GENEVO_FACTION_MATCHUPS
            : FACTION_MATCHUPS;
        if (!choices.includes(interaction.values[0]))
          throw new Error('Choose a valid faction matchup.');
        state.factions = interaction.values[0];
      } else if (action === 'score' && state.mode === 'report' && interaction.isButton()) {
        await interaction.showModal(
          new ModalBuilder()
            .setCustomId(`guide_tournament:savescore:${session.id}`)
            .setTitle('Enter Series Score')
            .addComponents(
              ...['your', 'opponent'].map((key, index) =>
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                  new TextInputBuilder()
                    .setCustomId(key)
                    .setLabel(index === 0 ? 'Your wins (0-9)' : 'Opponent wins (0-9)')
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(1)
                    .setRequired(true)
                    .setValue(state.score?.split('-')[index] ?? ''),
                ),
              ),
            ),
        );
        return;
      } else if (action === 'savescore' && state.mode === 'report' && interaction.isModalSubmit()) {
        const scores = ['your', 'opponent'].map((key) =>
          interaction.fields.getTextInputValue(key).trim(),
        );
        if (scores.some((score) => !/^\d$/.test(score)) || scores[0] === scores[1])
          throw new Error('Use scores from 0 to 9 with one winner.');
        state.score = scores.join('-');
        await interaction.reply({
          ...view(bot, session, member),
          content: undefined,
          ephemeral: true,
        });
        return;
      } else if (action === 'open' && state.mode === 'checkin' && interaction.isButton()) {
        await interaction.update({
          ...buildCheckinBoard(event.id, session.guildId, canManageTournament(member, event.id)),
          content: null,
        });
        sessions.consume(session);
        return;
      } else if (action === 'associate' && state.mode === 'participant' && interaction.isButton()) {
        const player = players(session).find((candidate) => candidate.id === state.playerId);
        const user = state.userId
          ? await interaction
              .guild!.members.fetch({ user: state.userId, force: true })
              .catch(() => null)
          : null;
        if (!player || !user || user.user.bot)
          throw new Error('Choose a registered player and a human server member.');
        sessions.consume(session);
        await associateParticipant(interaction, event.id, user.user, player.name);
        return;
      } else if (action === 'submit' && state.mode === 'report' && interaction.isButton()) {
        const player = players(session).find((candidate) => candidate.id === state.playerId);
        if (!player || !state.factions || !state.score)
          throw new Error('Choose an opponent, factions and score first.');
        sessions.consume(session);
        await submitScore(bot, interaction, {
          opponent: player.name,
          factions: state.factions,
          score: state.score,
          eventId: event.id,
        });
        return;
      } else if (state.mode === 'organizer' && interaction.isButton()) {
        if (action === 'revoke') state.revoke = true;
        else if (action === 'back') state.revoke = false;
        else if (action === 'assign' || (action === 'confirmrevoke' && state.revoke)) {
          if (tournamentAccessRepository.organizer(event.id) !== state.organizerBefore)
            throw new Error(
              'The organizer changed while this menu was open. Run /tournament organizer again.',
            );
          if (action === 'assign' && !state.serverId)
            throw new Error('Choose an organizer server first.');
          if (
            action === 'assign' &&
            !organizerServers(bot, session).some((guild) => guild.id === state.serverId)
          )
            throw new Error('That server is no longer available for this tournament.');
          sessions.consume(session);
          await assignOrganizer(
            bot,
            interaction,
            event.id,
            action === 'assign' ? state.serverId! : null,
          );
          return;
        } else throw new Error('This action is unavailable.');
      } else throw new Error('This action is unavailable.');
    }
    if (!interaction.isModalSubmit()) await interaction.update(view(bot, session, member));
  } catch (error) {
    const content =
      error instanceof Error && !('rawError' in error) && !('request' in error)
        ? error.message.slice(0, 500)
        : 'The action could not be completed. Reopen the menu and try again.';
    if (interaction.deferred || interaction.replied) await interaction.editReply({ content });
    else await interaction.reply({ content, ephemeral: true });
  } finally {
    session.busy = false;
  }
}
