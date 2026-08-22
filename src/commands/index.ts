import { REST, Routes } from 'discord.js';
import { readdirSync } from 'fs';
import { join } from 'path';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { RA3Bot } from '../bot';
import { Command } from '../types';
import { commandUsageRepository } from '../repositories/command-usage.repository';

/**
 * Wraps a command's execute so every invocation is recorded in command_usage
 * (usage analytics) before running. Recording failures never break the command.
 */
function withUsageTracking(command: Command): Command {
  const original = command.execute.bind(command);
  command.execute = async (bot, interaction) => {
    try {
      commandUsageRepository.track(
        command.data.name,
        interaction.user.id,
        interaction.guildId ?? null,
      );
    } catch (err) {
      logger.debug('command_usage insert failed:', err);
    }
    return original(bot, interaction);
  };
  return command;
}

/**
 * Walks the commands tree and loads every *.command module into memory.
 * A module that throws on import fails fast here — at boot, not mid-runtime.
 */
export async function loadCommands(bot: RA3Bot): Promise<void> {
  const commandsPath = join(__dirname);
  const extension = __filename.endsWith('.ts') ? '.command.ts' : '.command.js';

  const walkDir = (dir: string): void => {
    for (const file of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, file.name);
      if (file.isDirectory()) {
        walkDir(fullPath);
      } else if (file.name.endsWith(extension)) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const command = require(fullPath) as Partial<Command>;
        if (
          command.data &&
          typeof command.data.name === 'string' &&
          typeof command.execute === 'function'
        ) {
          if (bot.commands.has(command.data.name)) {
            throw new Error(
              `Duplicate command name registered: ${command.data.name} (${fullPath})`,
            );
          }
          bot.commands.set(command.data.name, withUsageTracking(command as Command));
        } else {
          logger.warn(`Skipping ${fullPath} - missing data.name or execute`);
        }
      }
    }
  };

  walkDir(commandsPath);
  logger.info(`Loaded ${bot.commands.size} commands`);
}

/** Pushes the loaded definitions to Discord (guild-scoped in dev, global in prod). */
export async function registerCommands(bot: RA3Bot): Promise<void> {
  const body = bot.commands.map((command) => ({
    ...(command.data.toJSON() as Record<string, unknown>),
    dm_permission: command.guildOnly === false,
  }));
  const clientId = bot.client.user?.id;
  if (!clientId) {
    logger.error('Cannot register commands: client user unavailable (not logged in?)');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);
  try {
    if (env.GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(clientId, env.GUILD_ID), { body });
      logger.info(`Registered ${body.length} guild commands (guild ${env.GUILD_ID})`);
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body });
      logger.info(`Registered ${body.length} global commands`);
    }
  } catch (error) {
    logger.error('Failed to register commands:', error);
  }
}
