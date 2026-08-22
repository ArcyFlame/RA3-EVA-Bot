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

export const data = new SlashCommandBuilder()
  .setName('maps')
  .setDescription('Where to download custom RA3 maps');

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
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
        name: '🟦 Steam Workshop (RA3)',
        value: 'Official Steam Workshop hub for RA3 maps - subscribe and they install automatically.',
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
        name: '🎲 Random Pick',
        value: 'Use `/pickmap` to get a random competitive map for your next match.',
        inline: false,
      },
    );

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
