import { Events, Message } from 'discord.js';
import { RA3Bot } from '../bot';
import { activityRankService } from '../services/activity-rank.service';

export const name = Events.MessageCreate;
export const once = false;

export async function execute(_bot: RA3Bot, message: Message): Promise<void> {
  await activityRankService.handleMessage(message);
}
