import { ButtonInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { openApi } from '../../commands/admin/api.view';
export const customId = 'setup_api';
export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  await openApi(interaction);
}
