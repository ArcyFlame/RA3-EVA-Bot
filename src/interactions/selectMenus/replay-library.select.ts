import { StringSelectMenuInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { selectReplay } from '../../commands/replays/replay-library.view';
export const customIdPrefix = 'replay_select:';
export async function execute(_bot: RA3Bot, interaction: StringSelectMenuInteraction) {
  await selectReplay(interaction);
}
