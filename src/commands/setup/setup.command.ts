import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { CNC_ONLINE, RA3_BATTLE_NET } from '../../utils/emojis';
import { getGameContext } from '../../utils/game-context';

export const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('How to install and play this server game online');

export const guildOnly = false;

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  const context = getGameContext(interaction.guildId);
  if (context.game === 'genevo') {
    const embed = new EmbedBuilder()
      .setTitle('🎮 Play Generals Evolution Online')
      .setDescription(
        'Generals Evolution runs on the Red Alert 3 engine and supports C&C Online and RA3BattleNet multiplayer. Install the current mod release before joining a lobby.',
      )
      .setColor(context.config.color)
      .setThumbnail(context.config.artworkUrl)
      .addFields(
        {
          name: '📦 Install Generals Evolution',
          value:
            '**1.** Install Red Alert 3.\n**2.** Download the current Generals Evolution release and launcher from the official ModDB page.\n**3.** Keep the launcher and maps updated to the same version used by other players.',
        },
        ...(context.sources.cncOnline
          ? [
              {
                name: `${CNC_ONLINE} C&C Online`,
                value:
                  '**1.** Create a C&C Online account.\n**2.** Install Tacticus.\n**3.** Launch the mod, sign in, and open Multiplayer.',
              },
            ]
          : []),
        ...(context.sources.ra3BattleNet
          ? [
              {
                name: `${RA3_BATTLE_NET} RA3BattleNet`,
                value:
                  '**1.** Install the RA3BattleNet launcher.\n**2.** Launch Generals Evolution with the same mod version as the lobby.\n**3.** Join a room identified as GenEvo.',
              },
            ]
          : []),
        {
          name: '⚠️ Multiplayer support',
          value: '1v1, 2v2 and 3v3 are supported. Eight-player games are experimental.',
        },
      );
    const buttons = [
      new ButtonBuilder()
        .setLabel('Download GenEvo')
        .setStyle(ButtonStyle.Link)
        .setURL(context.config.moddbDownloadsUrl),
    ];
    if (context.sources.cncOnline) {
      buttons.push(
        new ButtonBuilder()
          .setLabel('C&C Online')
          .setStyle(ButtonStyle.Link)
          .setURL('https://cnc-online.net/en/download/'),
      );
    }
    if (context.sources.ra3BattleNet) {
      buttons.push(
        new ButtonBuilder()
          .setLabel('RA3BattleNet')
          .setStyle(ButtonStyle.Link)
          .setURL('https://ra3battle.net'),
      );
    }
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);
    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    return;
  }
  const embed = new EmbedBuilder()
    .setTitle('🎮 Play Red Alert 3 Online')
    .setDescription(
      'RA3 multiplayer lives on two community platforms. Both are free, you only need the base game.',
    )
    .setColor(context.config.color)
    .setThumbnail(context.config.artworkUrl)
    .addFields(
      {
        name: `${CNC_ONLINE} C&C Online`,
        value: [
          '**1.** Create an account at cnc-online.net.',
          '**2.** Install the **Tacticus** client (it replaced the old C&C:Online launcher).',
          '**3.** Log in with your C&C Online account and launch RA3 from it.',
        ].join('\n'),
        inline: false,
      },
      ...(context.sources.ra3BattleNet
        ? [
            {
              name: `${RA3_BATTLE_NET} RA3BattleNet`,
              value: [
                '**1.** Create an account on the RA3BattleNet website.',
                '**2.** Download and install the RA3BattleNet launcher.',
                '**3.** Log in with your account and launch RA3.',
                '**4.** Join custom lobbies or use the built-in **matchmaking search** to find ranked games.',
              ].join('\n'),
              inline: false,
            },
          ]
        : []),
      {
        name: '💡 Tips',
        value:
          '• Use `/lobby` to see who is playing right now.\n' +
          '• Use `/maps` for custom map downloads.',
      },
    );

  const buttons = [
    new ButtonBuilder()
      .setLabel('C&C Online')
      .setStyle(ButtonStyle.Link)
      .setURL('https://cnc-online.net/en/download/'),
  ];
  if (context.sources.ra3BattleNet) {
    buttons.push(
      new ButtonBuilder()
        .setLabel('RA3BattleNet')
        .setStyle(ButtonStyle.Link)
        .setURL('https://ra3battle.net'),
    );
  }
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}
