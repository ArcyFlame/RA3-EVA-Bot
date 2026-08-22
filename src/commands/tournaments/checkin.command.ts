import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { guildRepository } from '../../repositories/guild.repository';
import {
  findTournament,
  getCurrentTournament,
  listTournamentContexts,
} from '../../services/tournament-context.service';
import { resolveMember } from '../../utils/members';
import { isAdminOrReferee } from '../../utils/permissions';
import { ESPORTS_FALLBACK_URL } from '../../utils/tournament-status';
import { buildCheckinBoard } from './checkin.utils';

export const data = new SlashCommandBuilder()
  .setName('checkin')
  .setDescription('Open the current tournament check-in board')
  .addStringOption((option) =>
    option
      .setName('event')
      .setDescription('Tournament name; current tournament is used when omitted')
      .setAutocomplete(true)
      .setRequired(false),
  );

function gameFor(interaction: ChatInputCommandInteraction | AutocompleteInteraction): string {
  if (!interaction.guildId) return 'ra3';
  return guildRepository.findByDiscordId(interaction.guildId)?.game ?? 'ra3';
}

export async function autocomplete(_bot: RA3Bot, interaction: AutocompleteInteraction) {
  const query = String(interaction.options.getFocused() ?? '').toLowerCase();
  await interaction.respond(
    listTournamentContexts(gameFor(interaction))
      .filter((event) => event.title.toLowerCase().includes(query))
      .slice(0, 25)
      .map((event) => ({ name: event.title.slice(0, 100), value: event.title.slice(0, 100) })),
  );
}

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Check-ins are available inside a server.', ephemeral: true });
    return;
  }

  const game = gameFor(interaction);
  const query = interaction.options.getString('event')?.trim();
  const event = query ? findTournament(query, game) : getCurrentTournament(game);
  if (!event) {
    await interaction.reply({
      content: query
        ? `No tournament matches **${query}**.`
        : 'I could not identify a current tournament.',
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setLabel('View RA3 Tournaments')
            .setStyle(ButtonStyle.Link)
            .setURL(ESPORTS_FALLBACK_URL),
        ),
      ],
      ephemeral: true,
    });
    return;
  }

  const member = await resolveMember(interaction);
  const staff = !!member && isAdminOrReferee(member);
  await interaction.reply({
    ...buildCheckinBoard(event.id, interaction.guild.id, staff),
    content: staff
      ? 'Referee menu: review the lists, refresh registrations, or post the public board.'
      : undefined,
    ephemeral: true,
  });
}
