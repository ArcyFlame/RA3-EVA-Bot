import { ApplicationCommandType, REST, Routes } from 'discord.js';
import { COMMAND_PATHS } from './command-paths';

interface RegisteredCommand {
  id: string;
  name: string;
  type: ApplicationCommandType;
}
export interface CommandDefinition {
  name: string;
  type?: ApplicationCommandType;
  [key: string]: unknown;
}

/** Keep production commands global and remove only this application's duplicate guild copies. */
export async function syncCommandDefinitions(
  rest: Pick<REST, 'get' | 'put' | 'delete'>,
  applicationId: string,
  definitions: CommandDefinition[],
  guildIds: string[],
  developmentGuildId?: string,
) {
  if (developmentGuildId) {
    await rest.put(Routes.applicationGuildCommands(applicationId, developmentGuildId), {
      body: definitions,
    });
    return { scope: 'guild', removed: 0, failedGuilds: [] as string[] };
  }
  // Cleanup starts only after Discord has accepted the complete global definitions.
  await rest.put(Routes.applicationCommands(applicationId), { body: definitions });
  const keys = new Set(
    definitions.map((c) => (c.type ?? ApplicationCommandType.ChatInput) + ':' + c.name),
  );
  let removed = 0;
  const failedGuilds: string[] = [];
  for (const guildId of new Set(guildIds)) {
    try {
      const existing = (await rest.get(
        Routes.applicationGuildCommands(applicationId, guildId),
      )) as RegisteredCommand[];
      for (const command of existing) {
        if (
          !keys.has(command.type + ':' + command.name) &&
          !(
            command.type === ApplicationCommandType.ChatInput &&
            Object.hasOwn(COMMAND_PATHS, command.name)
          )
        )
          continue;
        await rest.delete(Routes.applicationGuildCommand(applicationId, guildId, command.id));
        removed++;
      }
    } catch {
      failedGuilds.push(guildId);
    }
  }
  return { scope: 'global', removed, failedGuilds };
}
