import { ButtonInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { manageReplay } from '../../commands/replays/replay-manage.view';
export const customIdPrefix = 'replay_manage:';
export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  await manageReplay(interaction);
}
