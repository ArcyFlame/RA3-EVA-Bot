import { ButtonInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { replayRatingService } from '../../services/replay-rating.service';

export const customIdPrefix = 'replay_vote:';
export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  await replayRatingService.handleVote(interaction);
}
