import { readdirSync } from 'fs';
import { join } from 'path';
import { RA3Bot } from '../bot';
import { logger } from '../utils/logger';
import { wrapAsync } from '../utils/interaction-error';

interface EventModule {
  name?: string;
  once?: boolean;
  execute?: (bot: RA3Bot, ...args: unknown[]) => Promise<unknown> | unknown;
}

export async function registerEvents(bot: RA3Bot): Promise<void> {
  const eventsPath = join(__dirname);
  const extension = __filename.endsWith('.ts') ? '.ts' : '.js';
  const files = readdirSync(eventsPath).filter(
    (f) => f.endsWith(extension) && !f.startsWith('index.'),
  );

  for (const file of files) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const event = require(join(eventsPath, file)) as EventModule;
    if (!event.name || typeof event.execute !== 'function') {
      logger.warn(`Skipping event file ${file} - missing name or execute`);
      continue;
    }
    // wrapAsync: a throwing event handler must never surface as an
    // unhandled rejection and take down the process.
    const listener = wrapAsync(`event "${event.name}"`, async (...args: unknown[]) => {
      await event.execute!(bot, ...args);
    });
    if (event.once) {
      bot.client.once(event.name, listener);
    } else {
      bot.client.on(event.name, listener);
    }
    logger.debug(`Registered event: ${event.name}`);
  }
}
