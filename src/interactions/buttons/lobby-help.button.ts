import { ButtonInteraction, EmbedBuilder } from 'discord.js';
import { RA3Bot } from '../../bot';

export const customId = 'lobby_help';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  const embed = new EmbedBuilder()
    .setTitle('How to join an RA3 lobby')
    .setDescription(
      'Both C&C Online and RA3BattleNet use the same in-game lobby browser. ' +
        'Once you are logged in through the platform client, open the game and navigate to Multiplayer.',
    )
    .setColor(0x5865f2)
    .addFields(
      {
        name: 'Joining a lobby',
        value:
          '1. Launch RA3 through your platform client (Tacticus or RA3BattleNet launcher).\n' +
          '2. Go to Multiplayer.\n' +
          '3. Find the room in the lobby list and double-click to join.',
      },
      {
        name: 'RA3BattleNet matchmaking',
        value:
          'RA3BattleNet has a built-in matchmaking search. Use it from the multiplayer menu to automatically find ranked opponents.',
      },
      {
        name: 'Troubleshooting',
        value:
          'Make sure you are on the same game version (Steam).\n' +
          'Some lobbies may be password-protected, ask the host.',
      },
    );
  await interaction.reply({ embeds: [embed], ephemeral: true });
}
