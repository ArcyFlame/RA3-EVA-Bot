import { Events, TextChannel, Message, ActivityType } from 'discord.js';
import { RA3Bot } from '../bot';
import { logger } from '../utils/logger';
import { twitchNotifier } from '../services/twitch-notifier.service';
import { youTubeNotifier } from '../services/youtube-notifier.service';
import { moddbNotifier } from '../services/moddb-notifier.service';
import { matchReminderService } from '../services/match-reminder.service';
import { tournamentScanner } from '../services/tournament-scanner.service';
import { forumScanner } from '../services/forum-scanner.service';
import { newsScanner } from '../services/news-scanner.service';
import { generateBarChart } from '../utils/charts';
import { guildRepository } from '../repositories/guild.repository';
import { ra3StatsService } from '../services/ra3-stats.service';
import { StatsView } from '../commands/stats/stats.view';
import { env } from '../config/env';
import { statsPanelRepository, StatsPanel } from '../repositories/stats-panel.repository';
import { startLobbyPanelUpdater } from '../commands/admin/lobby-panel.command';
import { startMatchPanelUpdater } from '../commands/admin/match-panel.command';
import { wizardViews } from '../commands/notifications/views';
import { setStartTime } from '../commands/info/uptime.command';

export const name = Events.ClientReady;
export const once = true;

const PRESENCE_INTERVAL_MS = 2 * 60 * 1000;
const STATS_PANEL_INTERVAL_MS = 10 * 60 * 1000;

/** Handles kept for diagnostics and to guarantee no double-registration. */
const intervalHandles: NodeJS.Timeout[] = [];

function managedInterval(fn: () => Promise<void>, ms: number, label: string): void {
  let running = false;
  const handle = setInterval(() => {
    if (running) {
      logger.warn(`${label}: previous tick still running - skipping`);
      return;
    }
    running = true;
    fn()
      .catch((error) => logger.error(`${label} tick failed:`, error))
      .finally(() => {
        running = false;
      });
  }, ms);
  handle.unref();
  intervalHandles.push(handle);
}

export async function execute(bot: RA3Bot): Promise<void> {
  setStartTime();
  logger.info(`Logged in as ${bot.client.user?.tag}`);

  // Clean up wizard views when their messages are deleted.
  bot.client.on('messageDelete', (message) => {
    if (wizardViews.has(message.id)) wizardViews.delete(message.id);
  });

  // ── Dynamic presence (live player counts) ─────────────────────────────
  const updatePresence = async () => {
    try {
      const stats = await ra3StatsService.fetch();
      const presenceText = `C&C Online: ${stats.cnc_online} | RA3BattleNet: ${stats.ra3battle_online}`;
      bot.client.user?.setPresence({
        activities: [{ name: presenceText, type: ActivityType.Playing }],
        status: 'online',
      });
      logger.debug(`Presence updated: ${presenceText}`);
    } catch (error) {
      logger.error('Failed to update presence:', error);
    }
  };
  await updatePresence();
  managedInterval(updatePresence, PRESENCE_INTERVAL_MS, 'presence updater');

  // ── Notifiers ─────────────────────────────────────────────────────────
  if (env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET) {
    try {
      await twitchNotifier.start(bot.client);
      logger.info('Twitch notifier started');
    } catch (error) {
      logger.error('Failed to start Twitch notifier:', error);
    }
  } else {
    logger.info('Twitch credentials not provided - Twitch notifier disabled');
  }

  // Single source of truth for the callback URL (PUBLIC_CALLBACK_URL takes
  // precedence; YOUTUBE_CALLBACK_BASE is a legacy alias). bot.ts binds the
  // webhook server to the same URL, so they must not diverge.
  const callbackBase = env.PUBLIC_CALLBACK_URL ?? env.YOUTUBE_CALLBACK_BASE;
  if (env.YOUTUBE_API_KEY && callbackBase) {
    try {
      youTubeNotifier.setCallbackUrl(callbackBase);
      youTubeNotifier.setClient(bot.client);
      await youTubeNotifier.start();
      logger.info('YouTube notifier started');
    } catch (error) {
      logger.error('Failed to start YouTube notifier:', error);
    }
  } else {
    logger.info('YouTube API key or callback URL missing - YouTube notifier disabled');
  }

  try {
    moddbNotifier.setClient(bot.client);
    await moddbNotifier.start();
    logger.info('ModDB notifier started');
  } catch (error) {
    logger.error('Failed to start ModDB notifier:', error);
  }

  if (env.CHALLONGE_API_KEY) {
    matchReminderService.start(bot.client);
  } else {
    logger.info('Challonge API key missing - match reminders disabled');
  }

  // ── Tournament scanner (GameReplays eSports portal) ────────────────────
  tournamentScanner.setClient(bot.client);
  tournamentScanner.start();
  // Backfill recent tournaments once on boot, without blocking the ready handler.
  tournamentScanner.scan().catch((error) => logger.error('Initial tournament scan failed:', error));

  // ── Forum scanner (brackets/challonge links + registrations) ───────────
  forumScanner.start();
  forumScanner.scan().catch((error) => logger.error('Initial forum scan failed:', error));

  // ── News scanner (GameReplays news portal) ─────────────────────────────
  newsScanner.setClient(bot.client);
  newsScanner.start();
  newsScanner.scan().catch((error) => logger.error('Initial news scan failed:', error));

  // ── Persistent stats panels ───────────────────────────────────────────
  await updateStatsPanels(bot);
  managedInterval(() => updateStatsPanels(bot), STATS_PANEL_INTERVAL_MS, 'stats panel updater');

  startLobbyPanelUpdater(bot);
  startMatchPanelUpdater(bot);

  logger.info('All services initialized and ready!');
}

async function updateStatsPanels(bot: RA3Bot): Promise<void> {
  const configs = statsPanelRepository.getAll();
  if (configs.length === 0) return;

  // One API fetch per tick, shared across every guild panel.
  let view: StatsView | null = null;
  try {
    const stats = await ra3StatsService.fetch();
    view = new StatsView(stats);
  } catch (error) {
    logger.error('Stats panel updater: failed to fetch stats:', error);
    return;
  }

  for (const cfg of configs) {
    try {
      await updateSinglePanel(bot, cfg, view);
      // Small stagger to stay well inside channel rate limits.
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      logger.error(`Stats panel update failed for guild ${cfg.guildId}:`, error);
    }
  }
}

async function updateSinglePanel(bot: RA3Bot, cfg: StatsPanel, view: StatsView): Promise<void> {
  const guildData = guildRepository.findByDiscordId(cfg.guildId);
  if (!guildData || guildData.statsAutoUpdateEnabled === 0) return;

  const channel = cfg.channelId ? bot.client.channels.cache.get(cfg.channelId) : null;
  if (!(channel instanceof TextChannel)) {
    logger.warn(
      `Stats panel channel ${cfg.channelId} gone for guild ${cfg.guildId} - removing config`,
    );
    statsPanelRepository.delete(cfg.guildId);
    return;
  }

  // The shared public panel always shows the Live Stats overview (page 0);
  // per-page browsing happens in private replies triggered by its buttons.
  // RA3BattleNet sections (and the faction pie) render on RA3 servers only.
  const showRa3b = (guildData.game ?? 'ra3') === 'ra3';
  view.setPage(0);
  view.setShowRa3b(showRa3b);
  const embedPayload: any = { embeds: [view.getEmbed()], components: view.getComponents() };

  // Charts live in SEPARATE messages below the embed — grouped attachments
  // render as a cropped gallery, one chart per message looks right.
  const charts: Array<{ attachment: Buffer; name: string }> = [];
  try {
    const stats = await ra3StatsService.fetch();
    charts.push({
      attachment: await generateBarChart(stats.online_last_24h, 'Online Players (Last 24 Hours)', 'Reds_r'),
      name: 'online_players_last_24_hours.png',
    });
    charts.push({
      attachment: await generateBarChart(stats.new_players_last_30d, 'New Players (Last 30 Days)', 'Blues_r'),
      name: 'new_players_last_30_days.png',
    });
    charts.push({
      attachment: await generateBarChart(stats.online_last_30d, 'Online Players (Last 30 Days)', 'YlOrBr_r'),
      name: 'online_players_last_30_days.png',
    });
  } catch (error) {
    logger.warn('Stats panel charts failed (embed still updates):', error);
  }

  // Message 1: the stats embed.
  let msg: Message | null = null;
  if (cfg.messageId) {
    try {
      msg = await channel.messages.fetch(cfg.messageId);
    } catch {
      msg = null; // deleted or inaccessible — recreate below
    }
  }
  if (msg) {
    await msg.edit(embedPayload);
  } else {
    const created = await channel.send(embedPayload);
    statsPanelRepository.updateMessageId(cfg.guildId, created.id);
    msg = created;
  }

  // One message per chart, right below the embed. The stored value is a
  // JSON array of message ids in chart order.
  let chartIds: string[] = [];
  try {
    const parsed = JSON.parse(cfg.chartsMessageId ?? '[]');
    if (Array.isArray(parsed)) chartIds = parsed.filter((id) => typeof id === 'string');
  } catch {
    chartIds = [];
  }
  const newChartIds: string[] = [];
  for (let i = 0; i < charts.length; i++) {
    const file = charts[i];
    let chartMsg: Message | null = null;
    if (chartIds[i]) {
      try {
        chartMsg = await channel.messages.fetch(chartIds[i]);
      } catch {
        chartMsg = null;
      }
    }
    if (chartMsg) {
      await chartMsg.edit({ files: [file] });
      newChartIds.push(chartMsg.id);
    } else {
      const created = await channel.send({ files: [file] });
      newChartIds.push(created.id);
    }
  }
  if (JSON.stringify(newChartIds) !== JSON.stringify(chartIds)) {
    statsPanelRepository.updateChartsMessageId(cfg.guildId, JSON.stringify(newChartIds));
  }
  logger.debug(`Stats panel updated for guild ${cfg.guildId}`);
}
