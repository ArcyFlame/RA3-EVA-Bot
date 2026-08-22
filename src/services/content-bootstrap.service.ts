import { Client, TextChannel } from 'discord.js';
import { guildRepository } from '../repositories/guild.repository';
import { logger } from '../utils/logger';
import { moddbNotifier } from './moddb-notifier.service';
import { newsScanner } from './news-scanner.service';
import { tournamentScanner } from './tournament-scanner.service';
import { youTubeNotifier } from './youtube-notifier.service';

export type BootstrapResult = 'posted' | 'not_empty' | 'unavailable';

export async function postRecentIfChannelEmpty(
  client: Client,
  guildId: string,
  category: string,
  channelId: string,
): Promise<BootstrapResult> {
  const guild = client.guilds.cache.get(guildId);
  const channel = guild?.channels.cache.get(channelId);
  if (!(channel instanceof TextChannel)) return 'unavailable';

  try {
    const messages = await channel.messages.fetch({ limit: 1 });
    if (messages.size > 0) return 'not_empty';
  } catch (error) {
    logger.warn(`Could not inspect channel ${channelId} before posting recent content:`, error);
    return 'unavailable';
  }

  let posted = false;
  if (category === 'news') posted = await newsScanner.postLatestToGuild(guildId);
  else if (category === 'moddb') posted = await moddbNotifier.postLatestToGuild(guildId);
  else if (category === 'youtube') posted = await youTubeNotifier.postLatestToGuild(guildId);
  else if (category === 'tournament_events') posted = await tournamentScanner.postLatestToGuild(guildId);
  else return 'unavailable';
  return posted ? 'posted' : 'unavailable';
}

export async function bootstrapConfiguredContent(client: Client): Promise<void> {
  for (const guildData of guildRepository.getAllGuilds()) {
    const channels: Array<[string, string | undefined]> = [
      ['news', guildData.newsChannelId],
      ['moddb', guildData.moddbChannelId],
      ['youtube', guildData.youtubeChannelId],
      ['tournament_events', guildData.tournamentEventsChannelId],
    ];
    for (const [category, channelId] of channels) {
      if (!channelId) continue;
      await postRecentIfChannelEmpty(client, guildData.discordId, category, channelId).catch(
        (error) => logger.warn(`Content bootstrap failed for ${guildData.discordId}/${category}:`, error),
      );
    }
  }
}
