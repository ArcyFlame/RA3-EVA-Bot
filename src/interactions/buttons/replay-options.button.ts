import { ButtonInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { openReplayOptions } from '../../commands/replays/replay-library.view';

export const customIdPrefix = 'replay_options:';
export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  await openReplayOptions(interaction);
}
