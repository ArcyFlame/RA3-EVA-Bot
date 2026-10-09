'use strict';
require('dotenv').config();
// Command registration does not need or modify the production database.
process.env.DATABASE_PATH = ':memory:';
const { REST, Routes, Collection } = require('discord.js');
const { env } = require('../dist/config/env');
const { loadCommands } = require('../dist/commands');
const { syncCommandDefinitions } = require('../dist/utils/command-registration');

(async () => {
  const bot = { commands: new Collection() };
  await loadCommands(bot);
  const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);
  const user = await rest.get(Routes.user('@me'));
  const guilds = await rest.get(Routes.userGuilds());
  const definitions = bot.commands.map((command) => ({
    ...command.data.toJSON(),
    dm_permission: command.guildOnly === false,
  }));
  const result = await syncCommandDefinitions(
    rest,
    user.id,
    definitions,
    guilds.map((g) => g.id),
    env.COMMAND_SCOPE === 'guild' ? env.GUILD_ID : undefined,
  );
  console.log(
    `${user.username}: registered ${definitions.length} ${result.scope} commands, removed ${result.removed} duplicate server entries.`,
  );
  if (result.failedGuilds.length)
    throw new Error('Command cleanup failed for guilds: ' + result.failedGuilds.join(', '));
})().catch((error) => {
  // Do not dump REST request objects containing the token.
  console.error('Command registration failed:', error.message);
  process.exitCode = 1;
});
