import { ModalSubmitInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { handleMasters } from '../../commands/info/masters-manager.view';
export const customIdPrefix = 'masters:';
export async function execute(_bot: RA3Bot, interaction: ModalSubmitInteraction) {
  await handleMasters(interaction);
}
