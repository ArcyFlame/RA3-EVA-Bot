import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { MODDB, RA3_BATTLE_NET } from '../../utils/emojis';
import { getGameContext } from '../../utils/game-context';
import { gameMapNames, RA3_TOURNAMENT_MAPS } from '../../data/game-maps';

export const data = new SlashCommandBuilder()
  .setName('maps')
  .setDescription('Map downloads and the map catalog for this server game');

export const guildOnly = false;

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  const context = getGameContext(interaction.guildId);
  if (context.game === 'genevo') {
    const embed = new EmbedBuilder()
      .setTitle('🗺️ Generals Evolution Maps')
      .setDescription(
        `The bot recognizes **${gameMapNames('genevo').length} Generals Evolution 0.33 maps** and uses their internal IDs to keep GenEvo lobbies separate from Red Alert 3. Maps are installed and updated with the mod.`,
      )
      .setColor(context.config.color)
      .setThumbnail(context.config.artworkUrl)
      .addFields(
        {
          name: `${MODDB} Official ModDB`,
          value:
            'Download the current release and map updates from the official Generals Evolution page.',
        },
        {
          name: '🌐 Multiplayer',
          value:
            'Use C&C Online. Eight-player games are experimental and are not treated as a supported 4v4 mode.',
        },
      );
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel('Generals Evolution')
        .setStyle(ButtonStyle.Link)
        .setURL(context.config.moddbDownloadsUrl),
      new ButtonBuilder()
        .setLabel('C&C Online')
        .setStyle(ButtonStyle.Link)
        .setURL('https://cnc-online.net/en/'),
    );
    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    return;
  }
  const embed = new EmbedBuilder()
    .setTitle('🗺️ Custom Map Downloads')
    .setDescription(
      'Download community maps, then place the extracted folder into:\n' +
        '`C:\\Users\\<you>\\AppData\\Roaming\\Red Alert 3\\Maps\\`\n' +
        '(shortcut: paste `%APPDATA%\\Red Alert 3\\Maps` in the Explorer address bar).',
    )
    .setColor(0x00ae86)
    .addFields(
      {
        name: '🏆 Default Tournament Pool',
        value: RA3_TOURNAMENT_MAPS.join(' • '),
        inline: false,
      },
      {
        name: '🟦 Steam Workshop (RA3)',
        value:
          'Official Steam Workshop hub for RA3 maps - subscribe and they install automatically.',
        inline: false,
      },
      {
        name: '🌐 CNCLabs Maps',
        value: 'Large RA3 map archive with screenshots and player ratings.',
        inline: false,
      },
      {
        name: `${RA3_BATTLE_NET} RA3BattleNet Maps`,
        value: 'Maps used by the RA3BattleNet community, including the ranked map pool.',
        inline: false,
      },
      {
        name: `${MODDB} ModDB`,
        value: 'Mods and custom map packs uploaded by the community.',
        inline: false,
      },
      {
        name: '🏁 Tournament Elimination',
        value: `Use \`/pickmap [event]\` to show the verified pool and official elimination order. The bot recognizes **${gameMapNames('ra3').length}** official, bonus and community maps.`,
        inline: false,
      },
    )
    .setThumbnail(context.config.artworkUrl);

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('Steam Workshop')
      .setStyle(ButtonStyle.Link)
      .setURL('https://steamcommunity.com/app/17480/workshop/'),
    new ButtonBuilder()
      .setLabel('CNCLabs Maps')
      .setStyle(ButtonStyle.Link)
      .setURL('https://www.cnclabs.com/maps/redalert3/maps.aspx'),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('RA3BattleNet Maps')
      .setStyle(ButtonStyle.Link)
      .setURL('https://ra3.z31.xyz/maps'),
    new ButtonBuilder()
      .setLabel('ModDB')
      .setStyle(ButtonStyle.Link)
      .setURL('https://www.moddb.com/games/cc-red-alert-3/mods'),
  );

  await interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
}
