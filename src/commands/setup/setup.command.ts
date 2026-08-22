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

export const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('How to install C&C Online or RA3BattleNet to play RA3 online');

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  const embed = new EmbedBuilder()
    .setTitle('🎮 Play Red Alert 3 Online')
    .setDescription(
      'RA3 multiplayer lives on two community platforms. Both are free, you only need the base game.',
    )
    .setColor(0x5865f2)
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
      {
        name: '💡 Tips',
        value:
          '• Use `/lobby` to see who is playing right now.\n' +
          '• Use `/maps` for custom map downloads.',
      },
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('C&C Online')
      .setStyle(ButtonStyle.Link)
      .setURL('https://cnc-online.net/en/download/'),
    new ButtonBuilder()
      .setLabel('RA3BattleNet')
      .setStyle(ButtonStyle.Link)
      .setURL('https://ra3battle.net'),
  );

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}
