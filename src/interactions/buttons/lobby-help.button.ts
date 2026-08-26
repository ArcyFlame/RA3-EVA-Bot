import { ButtonInteraction, EmbedBuilder } from 'discord.js';
import { RA3Bot } from '../../bot';
import { getGameContext } from '../../utils/game-context';

export const customId = 'lobby_help';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  const context = getGameContext(interaction.guildId);
  const isGenevo = context.game === 'genevo';
  const embed = new EmbedBuilder()
    .setTitle(`How to join a ${context.config.shortLabel} lobby`)
    .setDescription(
      isGenevo
        ? 'Generals Evolution multiplayer runs through C&C Online and RA3BattleNet in the Red Alert 3 engine.'
        : 'C&C Online and RA3BattleNet use the in-game multiplayer lobby browser.',
    )
    .setColor(context.config.color)
    .addFields(
      {
        name: 'Joining a lobby',
        value:
          `1. ${isGenevo ? 'Launch Generals Evolution through your enabled platform.' : 'Launch RA3 through your enabled platform client.'}\n` +
          '2. Go to Multiplayer.\n' +
          '3. Find the room in the lobby list and double-click to join.',
      },
      ...(!isGenevo && context.sources.ra3BattleNet
        ? [
            {
              name: 'RA3BattleNet matchmaking',
              value:
                'RA3BattleNet has a built-in matchmaking search. Use it from the multiplayer menu to automatically find ranked opponents.',
            },
          ]
        : []),
      {
        name: 'Troubleshooting',
        value:
          'Make sure you are on the same game version (Steam).\n' +
          'Some lobbies may be password-protected, ask the host.',
      },
    );
  await interaction.reply({ embeds: [embed], ephemeral: true });
}
