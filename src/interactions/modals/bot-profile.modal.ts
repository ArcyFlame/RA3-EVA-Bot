import { ModalSubmitInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { handleBotProfile } from '../../commands/setup/bot-profile.view';
export const customIdPrefix = 'bot_profile:';
export async function execute(_bot: RA3Bot, interaction: ModalSubmitInteraction) {
  await handleBotProfile(interaction);
}
