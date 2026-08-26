import { ButtonInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { userRepository } from '../../repositories/user.repository';
import { buildLinkManager } from '../../commands/profile/link.view';
import { getGameContext } from '../../utils/game-context';

export const customIdPrefix = 'link_remove_';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  const platform = interaction.customId.slice('link_remove_'.length);
  if (platform === 'shatabrick') userRepository.unlinkShatabrick(interaction.user.id);
  else if (platform === 'ra3b') userRepository.unlinkRa3BattleNet(interaction.user.id);
  else {
    await interaction.reply({ content: 'Invalid platform.', ephemeral: true });
    return;
  }
  await interaction.update(
    buildLinkManager(
      interaction.user.id,
      userRepository.getLanguage(interaction.user.id),
      getGameContext(interaction.guildId).game,
    ),
  );
}
