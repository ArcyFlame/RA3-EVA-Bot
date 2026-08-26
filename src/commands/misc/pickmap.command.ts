import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { guildRepository } from '../../repositories/guild.repository';
import { isKnownSkirmishMap } from '../../services/ra3-stats.service';
import {
  findTournament,
  getCurrentTournament,
  listTournamentContexts,
} from '../../services/tournament-context.service';
import { GameId, GAME_CONFIGS } from '../../config/games';
import { GENEVO_MAPS, RA3_TOURNAMENT_MAPS } from '../../data/game-maps';

const PATCH_1_12_8_URL = 'https://www.gamereplays.org/community/index.php?showtopic=1083648';
const DEFAULT_PATCH_MAPS = [...RA3_TOURNAMENT_MAPS];

export const data = new SlashCommandBuilder()
  .setName('pickmap')
  .setDescription('Show a tournament map pool and the official elimination order')
  .addStringOption((option) =>
    option
      .setName('event')
      .setDescription('Tournament name; current tournament is used when omitted')
      .setAutocomplete(true)
      .setRequired(false),
  );

export const guildOnly = false;

function gameFor(interaction: ChatInputCommandInteraction | AutocompleteInteraction): GameId {
  if (!interaction.guildId) return 'ra3';
  return guildRepository.findByDiscordId(interaction.guildId)?.game ?? 'ra3';
}

export function mapEliminationInstructions(): string {
  return [
    '**1.** Agree who starts. If you cannot decide quickly, the player with the lower seed number starts.',
    '**2.** Player A removes one map, then Player B removes one map.',
    '**3.** Player A removes another map, then Player B removes another map. Continue alternating if more than three maps remain.',
    '**4.** With three maps left, Player A chooses the first map and Player B chooses the second map.',
    '**5.** Use the same alternating principle for a BO5 series.',
  ].join('\n');
}

export async function autocomplete(_bot: RA3Bot, interaction: AutocompleteInteraction) {
  const query = String(interaction.options.getFocused() ?? '').toLowerCase();
  const options = listTournamentContexts(gameFor(interaction))
    .filter((event) => event.title.toLowerCase().includes(query))
    .slice(0, 25)
    .map((event) => ({ name: event.title.slice(0, 100), value: event.title.slice(0, 100) }));
  await interaction.respond(options);
}

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  const game = gameFor(interaction);
  const gameConfig = GAME_CONFIGS[game];
  const eventQuery = interaction.options.getString('event')?.trim();
  const event = eventQuery ? findTournament(eventQuery, game) : getCurrentTournament(game);

  if (eventQuery && !event) {
    await interaction.reply({
      content: `I could not verify a tournament named **${eventQuery}**.`,
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setLabel(`View ${gameConfig.shortLabel}`)
            .setStyle(ButtonStyle.Link)
            .setURL(gameConfig.tournamentFallbackUrl),
        ),
      ],
      ephemeral: true,
    });
    return;
  }

  if (!event && game === 'genevo') {
    await interaction.reply({
      content:
        'I could not find a current Generals Evolution tournament with a verified map pool.',
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setLabel('Generals Evolution Downloads')
            .setStyle(ButtonStyle.Link)
            .setURL(gameConfig.moddbDownloadsUrl),
        ),
      ],
      ephemeral: true,
    });
    return;
  }

  let maps: string[] = game === 'genevo' ? [...GENEVO_MAPS] : DEFAULT_PATCH_MAPS;
  if (event) {
    maps = (event.maps ?? '')
      .split(/,\s*/)
      .map((map) => map.trim())
      .filter((map) => map && isKnownSkirmishMap(map, game));
    if (maps.length === 0) {
      const detailsUrl =
        event.registrationUrl ??
        event.topicUrl ??
        event.eventUrl ??
        gameConfig.tournamentFallbackUrl;
      await interaction.reply({
        content:
          `I could not verify the map pool for **${event.title}**. ` +
          'Please use the tournament post instead of a generic pool.',
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setLabel('Open Tournament Post')
              .setStyle(ButtonStyle.Link)
              .setURL(detailsUrl),
          ),
        ],
        ephemeral: true,
      });
      return;
    }
  }

  const mapPool = maps.map((map, index) => `${index + 1}. ${map}`).join('\n').slice(0, 1024);
  const embed = new EmbedBuilder()
    .setTitle('🗺️ Map Elimination')
    .setDescription(
      event
        ? `Official elimination order for **${event.title}**.`
        : 'Official elimination order for the default Red Alert 3 tournament pool.',
    )
    .setColor(gameConfig.color)
    .setThumbnail(gameConfig.artworkUrl)
    .addFields(
      { name: 'Map Pool', value: mapPool, inline: false },
      { name: 'NEW Map Elimination Guide', value: mapEliminationInstructions(), inline: false },
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel(game === 'ra3' ? '1.12.8 Patch' : 'Generals Evolution 0.33')
      .setStyle(ButtonStyle.Link)
      .setURL(game === 'ra3' ? PATCH_1_12_8_URL : gameConfig.moddbDownloadsUrl),
  );
  await interaction.reply({ embeds: [embed], components: [row] });
}
