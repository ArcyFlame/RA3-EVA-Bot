import { ButtonInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { handleRefresh } from '../../commands/admin/refresh-admin.view';
export const customIdPrefix = 'refresh:';
export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  await handleRefresh(interaction);
}
