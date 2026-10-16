import { ButtonInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { handlePanelMenu } from '../../commands/admin/panel-menu.view';
export const customIdPrefix = 'guide_panel:';
export async function execute(bot: RA3Bot, interaction: ButtonInteraction) {
  await handlePanelMenu(bot, interaction);
}
