import { Events, Message, PartialMessage } from 'discord.js';
import { RA3Bot } from '../bot';
import { replayRatingRepository } from '../repositories/replay-rating.repository';
export const name = Events.MessageDelete;
export const once = false;
export async function execute(_bot: RA3Bot, message: Message | PartialMessage): Promise<void> {
  replayRatingRepository.closeMessage(message.id);
}
