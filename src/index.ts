import { RA3Bot } from './bot';
import { logger } from './utils/logger';

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection:', reason);
});

// Keep running through transient uncaught exceptions (e.g. network blips) but
// exit if they cascade — a crash-looping process is worse than a clean exit.
const CRASH_WINDOW_MS = 60_000;
const CRASH_LIMIT = 5;
let crashes: number[] = [];
process.on('uncaughtException', (error) => {
  // Console first: if the exception came from the logger's serializer, going
  // through winston again could recurse.
  // eslint-disable-next-line no-console
  console.error('[uncaughtException]', error);
  crashes = crashes.filter((t) => Date.now() - t < CRASH_WINDOW_MS);
  crashes.push(Date.now());
  if (crashes.length >= CRASH_LIMIT) {
    logger.error('Too many uncaught exceptions - exiting.', error);
    process.exit(1);
  }
  logger.error('Uncaught exception (survived):', error);
});

const bot = new RA3Bot();

let signalsRegistered = false;
function registerSignalHandlers(): void {
  if (signalsRegistered) return;
  signalsRegistered = true;
  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}`);
    // Hard-exit failsafe: never hang on shutdown longer than 10s.
    const failsafe = setTimeout(() => process.exit(1), 10_000);
    failsafe.unref();
    bot.stop().finally(() => process.exit(0));
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

registerSignalHandlers();

bot.start().catch((error) => {
  logger.error('Failed to start bot:', error);
  process.exit(1);
});
