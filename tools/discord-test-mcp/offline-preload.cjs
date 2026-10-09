'use strict';

// Applied only to the test child and its workers, never the running bot.
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const dotenv = require(path.join(root, 'node_modules/dotenv'));
dotenv.config = () => ({ parsed: {} });
dotenv.configDotenv = () => ({ parsed: {} });
process.env.DISCORD_TOKEN = 'test-token-0000000000000000';
process.env.DATABASE_PATH = ':memory:';
process.env.OWNER_ID = '123456789012345678';
process.env.LOG_LEVEL = 'error';
delete process.env.LOG_FILE;

function blocked() {
  const error = new Error(
    'Network calls are disabled in Discord MCP offline tests. Mock the provider.',
  );
  error.code = 'DISCORD_TEST_NETWORK_BLOCKED';
  throw error;
}
globalThis.fetch = async () => blocked();
require('node:http').request = blocked;
require('node:http').get = blocked;
require('node:https').request = blocked;
require('node:https').get = blocked;
require('node:net').Socket.prototype.connect = blocked;
require('node:tls').connect = blocked;
require('node:dgram').createSocket = blocked;
