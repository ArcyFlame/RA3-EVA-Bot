import { ButtonInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { openBotProfile } from '../../commands/setup/bot-profile.view';
export const customId = 'setup_profile';
export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  await openBotProfile(interaction);
}
