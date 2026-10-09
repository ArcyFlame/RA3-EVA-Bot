import { Events, Message, MessageReaction, PartialMessageReaction } from 'discord.js';
import { RA3Bot } from '../bot';
import { replayRatingService } from '../services/replay-rating.service';
export const name = Events.MessageReactionRemoveEmoji;
export const once = false;
export async function execute(
  _bot: RA3Bot,
  reaction: MessageReaction | PartialMessageReaction,
): Promise<void> {
  const vote = reaction.emoji.name === '👍' ? 1 : reaction.emoji.name === '👎' ? -1 : undefined;
  if (vote) await replayRatingService.clear(reaction.message as Message, vote);
}
