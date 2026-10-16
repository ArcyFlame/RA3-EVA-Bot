import { ButtonInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { navigateReplayLibrary } from '../../commands/replays/replay-library.view';
export const customIdPrefix = 'replay_library:';
export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  await navigateReplayLibrary(interaction);
}
