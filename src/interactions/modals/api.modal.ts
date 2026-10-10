import { ModalSubmitInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { handleApi } from '../../commands/admin/api.view';
export const customIdPrefix = 'service_api:';
export async function execute(bot: RA3Bot, interaction: ModalSubmitInteraction) {
  await handleApi(bot, interaction);
}
