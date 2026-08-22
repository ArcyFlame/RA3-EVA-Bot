import { ButtonInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { showPersonalDmMenu } from '../../utils/notification-views';

export const customId = 'personal_dm';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });
  await showPersonalDmMenu(interaction);
}
