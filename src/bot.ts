import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import { env } from './config/env';
import { logger } from './utils/logger';
import { connectDatabase, disconnectDatabase } from './database/connection';
import { loadCommands, registerCommands } from './commands';
import { registerEvents } from './events';
import { registerComponents } from './interactions';
import { twitchNotifier } from './services/twitch-notifier.service';
import { youTubeNotifier } from './services/youtube-notifier.service';
import { moddbNotifier } from './services/moddb-notifier.service';
import { matchReminderService } from './services/match-reminder.service';
import { tournamentScanner } from './services/tournament-scanner.service';
import { WebhookServer } from './webhook/server';
import { Command, ComponentRegistries, createRegistry } from './types';

export class RA3Bot {
  public readonly client: Client;
  public readonly commands = new Collection<string, Command>();
  public readonly components: ComponentRegistries = {
    buttons: createRegistry(),
    modals: createRegistry(),
    selectMenus: createRegistry(),
  };
  private webhookServer: WebhookServer | null = null;
  private shuttingDown = false;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions,
      ],
      partials: [Partials.Channel, Partials.Message, Partials.Reaction],
    });

    this.client.on('error', (error) => logger.error('Discord client error:', error));
    // discord.js v14.15: rate-limit diagnostics live on the REST manager.
    this.client.rest.on('rateLimited', (info) => {
      logger.warn(
        `Rate limited on ${info.route} (global: ${info.global}, retry after: ${info.retryAfter}ms)`,
      );
    });
  }

  async start(): Promise<void> {
    await connectDatabase();
    // Load local definitions before login so a broken file fails fast at boot.
    await loadCommands(this);
    await registerComponents(this);
    await registerEvents(this);
    await this.client.login(env.DISCORD_TOKEN);
    // Push slash-command definitions to Discord only after we know our client id.
    await registerCommands(this);

    if (env.PUBLIC_CALLBACK_URL && env.YOUTUBE_API_KEY) {
      try {
        this.webhookServer = new WebhookServer(env.WEBHOOK_PORT);
        this.webhookServer.start();
        youTubeNotifier.setCallbackUrl(env.PUBLIC_CALLBACK_URL.replace(/\/$/, ''));
      } catch (error) {
        logger.error('Failed to start webhook server:', error);
      }
    }

    logger.info('Bot started successfully');
  }

  /** Idempotent — safe to call from multiple signal handlers. */
  async stop(): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    logger.info('Shutting down...');
    try {
      twitchNotifier.stop();
      youTubeNotifier.stop();
      moddbNotifier.stop();
      matchReminderService.stop();
      tournamentScanner.stop();
      this.webhookServer?.stop();
      await disconnectDatabase();
      this.client.destroy();
    } catch (error) {
      logger.error('Error during shutdown:', error);
    }
  }
}
