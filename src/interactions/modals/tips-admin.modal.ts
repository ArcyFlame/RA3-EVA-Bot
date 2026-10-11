import { ModalSubmitInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { handleTipManager } from '../../commands/admin/tips-admin.view';
export const customIdPrefix = 'tipmgr:';
export async function execute(_bot: RA3Bot, interaction: ModalSubmitInteraction) {
  await handleTipManager(interaction);
}
