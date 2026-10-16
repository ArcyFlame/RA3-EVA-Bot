import { ModalSubmitInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { manageReplayMedals } from '../../commands/replays/replay-medals.view';
export const customIdPrefix = 'replay_medals:';
export async function execute(_bot: RA3Bot, interaction: ModalSubmitInteraction) {
  await manageReplayMedals(interaction);
}
