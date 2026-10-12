import { StringSelectMenuInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { handleMasters } from '../../commands/info/masters-manager.view';
export const customIdPrefix = 'masters:';
export async function execute(_bot: RA3Bot, interaction: StringSelectMenuInteraction) {
  await handleMasters(interaction);
}
