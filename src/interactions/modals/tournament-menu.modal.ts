import { ModalSubmitInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { handleTournamentMenu } from '../../commands/tournaments/tournament-menu.view';
export const customIdPrefix = 'guide_tournament:';
export async function execute(bot: RA3Bot, interaction: ModalSubmitInteraction) {
  await handleTournamentMenu(bot, interaction);
}
