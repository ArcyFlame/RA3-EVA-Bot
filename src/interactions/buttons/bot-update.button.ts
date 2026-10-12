import { ButtonInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { handleBotUpdate } from '../../commands/admin/bot-update.view';

export const customIdPrefix = 'botupdate:';
export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  await handleBotUpdate(interaction);
}
