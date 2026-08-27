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
import { generateBarChart, statsChartPalettes } from '../utils/charts';
import { guildRepository } from '../repositories/guild.repository';
import { ra3StatsService } from '../services/ra3-stats.service';
import { StatsView } from '../commands/stats/stats.view';
import { env } from '../config/env';
import { statsPanelRepository, StatsPanel } from '../repositories/stats-panel.repository';
import { startLobbyPanelUpdater } from '../commands/admin/lobby-panel.command';
import { startMatchPanelUpdater } from '../commands/admin/match-panel.command';
import { wizardViews } from '../commands/notifications/views';
import { setStartTime } from '../commands/info/uptime.command';
import { bootstrapConfiguredContent } from '../services/content-bootstrap.service';
import { checkinNotificationService } from '../services/checkin-notification.service';
import { getGameContext } from '../utils/game-context';

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
      const guilds = guildRepository.getAllGuilds();
      const useCnc = guilds.length === 0 || guilds.some((guild) => guild.cncOnlineEnabled === 1);
      const useRa3Cnc =
        guilds.length === 0 ||
        guilds.some((guild) => guild.game === 'ra3' && guild.cncOnlineEnabled === 1);
      const useGenevoCnc = guilds.some(
        (guild) => guild.game === 'genevo' && guild.cncOnlineEnabled === 1,
      );
      const useRa3Ra3b =
        guilds.length === 0 ||
        guilds.some((guild) => guild.game === 'ra3' && guild.ra3BattleNetEnabled === 1);
      const useGenevoRa3b = guilds.some(
        (guild) => guild.game === 'genevo' && guild.ra3BattleNetEnabled === 1,
      );
      const useRa3b = useRa3Ra3b || useGenevoRa3b;
      const [ra3Stats, genevoStats] = await Promise.all([
        useRa3Cnc || useRa3Ra3b
          ? ra3StatsService.fetch('ra3', {
              cncOnline: useRa3Cnc,
              ra3BattleNet: useRa3Ra3b,
            })
          : null,
        useGenevoCnc || useGenevoRa3b
          ? ra3StatsService.fetch('genevo', {
              cncOnline: useGenevoCnc,
              ra3BattleNet: useGenevoRa3b,
            })
          : null,
      ]);
      const cncOnline =
        (useRa3Cnc ? (ra3Stats?.cnc_online ?? 0) : 0) +
        (useGenevoCnc ? (genevoStats?.cnc_online ?? 0) : 0);
      const platforms = [
        useCnc ? `C&C Online: ${cncOnline}` : '',
        useRa3b
          ? `RA3BattleNet: ${
              useRa3Ra3b ? (ra3Stats?.ra3battle_online ?? 0) : (genevoStats?.ra3battle_online ?? 0)
            }`
          : '',
      ].filter(Boolean);
      const presenceText = platforms.join(' | ') || 'Community tools ready';
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
  try {
    youTubeNotifier.setClient(bot.client);
    if (callbackBase) {
      youTubeNotifier.setCallbackUrl(callbackBase);
    }
    await youTubeNotifier.start();
    logger.info('YouTube notifier started');
  } catch (error) {
    logger.error('Failed to start YouTube notifier:', error);
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

  // ── Forum scanner (brackets/challonge links + registrations) ───────────
  checkinNotificationService.setClient(bot.client);
  forumScanner.start();

  // ── News scanner (GameReplays news portal) ─────────────────────────────
  newsScanner.setClient(bot.client);
  newsScanner.start();
  void Promise.allSettled([tournamentScanner.scan(), forumScanner.scan(), newsScanner.scan()])
    .then(async () => {
      await bootstrapConfiguredContent(bot.client);
      // This crawl is resumable and normally does no work after the historical
      // forum has been indexed once.
      await forumScanner.backfillHistoricalWinners();
    })
    .catch((error) => logger.error('Startup content refresh failed:', error));

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

  for (const cfg of configs) {
    try {
      await updateSinglePanel(bot, cfg);
      // Small stagger to stay well inside channel rate limits.
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      logger.error(`Stats panel update failed for guild ${cfg.guildId}:`, error);
    }
  }
}

async function updateSinglePanel(bot: RA3Bot, cfg: StatsPanel): Promise<void> {
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

  const context = getGameContext(cfg.guildId);
  const stats = await ra3StatsService.fetch(context.game, context.sources);
  const view = new StatsView(stats, context.game, context.sources);
  const [online24Palette, newPlayersPalette, online30Palette] = statsChartPalettes(context.game);
  view.setPage(0);
  const embedPayload: any = { embeds: [view.getEmbed()], components: view.getComponents() };

  // Charts live in SEPARATE messages below the embed — grouped attachments
  // render as a cropped gallery, one chart per message looks right.
  const charts: Array<{ attachment: Buffer; name: string }> = [];
  try {
    if (context.sources.cncOnline || context.sources.ra3BattleNet)
      charts.push({
        attachment: await generateBarChart(
          stats.online_last_24h,
          'Online Players (Last 24 Hours)',
          online24Palette,
          context.game,
        ),
        name: 'online_players_last_24_hours.png',
      });
    if (
      (context.game === 'ra3' && context.sources.ra3BattleNet) ||
      (context.game === 'genevo' && (context.sources.cncOnline || context.sources.ra3BattleNet))
    )
      charts.push({
        attachment: await generateBarChart(
          stats.new_players_last_30d,
          'New Players (Last 30 Days)',
          newPlayersPalette,
          context.game,
        ),
        name: 'new_players_last_30_days.png',
      });
    if (context.sources.cncOnline || context.sources.ra3BattleNet)
      charts.push({
        attachment: await generateBarChart(
          stats.online_last_30d,
          'Online Players (Last 30 Days)',
          online30Palette,
          context.game,
        ),
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
