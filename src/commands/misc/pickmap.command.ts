import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
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
  .setDescription('Pick a verified map for a tournament or the 1.12.8 patch')
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

function minimapPath(mapName: string): string | undefined {
  const slug = mapName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const path = join(process.cwd(), 'images', 'maps', `${slug}.png`);
  return existsSync(path) ? path : undefined;
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

  const map = maps[Math.floor(Math.random() * maps.length)];
  const embed = new EmbedBuilder()
    .setTitle('🗺️ Map Pick')
    .setDescription(
      `**${map}**${event ? `\nFrom **${event.title}**` : game === 'ra3' ? '\nFrom the default tournament pool' : '\nFrom the Generals Evolution 0.33 map catalog'}`,
    )
    .setColor(gameConfig.color)
    .setThumbnail(gameConfig.artworkUrl);

  const minimap = minimapPath(map);
  const files: Array<{ attachment: string; name: string }> = [];
  if (minimap) {
    files.push({ attachment: minimap, name: 'minimap.png' });
    embed.setImage('attachment://minimap.png');
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel(game === 'ra3' ? '1.12.8 Patch' : 'Generals Evolution 0.33')
      .setStyle(ButtonStyle.Link)
      .setURL(game === 'ra3' ? PATCH_1_12_8_URL : gameConfig.moddbDownloadsUrl),
  );
  await interaction.reply({ embeds: [embed], components: [row], files });
}
