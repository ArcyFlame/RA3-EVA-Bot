import { Events, MessageReaction, PartialMessageReaction, User, PartialUser } from 'discord.js';
import { RA3Bot } from '../bot';
import { replayRatingService } from '../services/replay-rating.service';
export const name = Events.MessageReactionRemove;
export const once = false;
export async function execute(
  _bot: RA3Bot,
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
): Promise<void> {
  await replayRatingService.handleReaction(reaction, user, true);
}
