import { ButtonInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { userRepository } from '../../repositories/user.repository';
import { showPersonalDmMenu } from '../../utils/notification-views';

export const customId = 'toggle_clan_dm';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const user = userRepository.findByDiscordId(interaction.user.id);
  const current = user?.clanInviteDmEnabled === 1;
  userRepository.setClanInviteDmEnabled(interaction.user.id, !current);
  await showPersonalDmMenu(interaction);
}
