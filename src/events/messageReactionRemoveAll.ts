import { Events, Message, PartialMessage } from 'discord.js';
import { RA3Bot } from '../bot';
import { replayRatingService } from '../services/replay-rating.service';
export const name = Events.MessageReactionRemoveAll;
export const once = false;
export async function execute(_bot: RA3Bot, message: Message | PartialMessage): Promise<void> {
  await replayRatingService.clear(message as Message);
}
