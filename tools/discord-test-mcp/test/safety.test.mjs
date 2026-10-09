import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DiscordInspector, summarizeMessage } from '../discord.mjs';
import { componentInventory, inlineControls, resolveInventoryComponent } from '../inventory.mjs';
import { offlineEnvironment, runOfflineTests } from '../runner.mjs';
import { spawn } from 'node:child_process';
import { projectRoot } from '../inventory.mjs';
import { join } from 'node:path';

const guildId = '111111111111111111';
const channelId = '222222222222222222';
const botId = '333333333333333333';
function fixture(replies) {
  const calls = [];
  const inspector = new DiscordInspector({
    config: () => ({ guildId, channelIds: [channelId], useBotEnv: false }),
    token: () => 'private-test-credential',
    fetcher: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify(replies.shift()), {
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  inspector.nextRequest = -Infinity;
  return { inspector, calls };
}

test('discovers every registered kind without importing bot runtime', () => {
  const inventory = componentInventory();
  assert.ok(inventory.length > 50);
  assert.ok(inventory.every((c) => c.validExport));
  for (const kind of ['button', 'modal', 'select'])
    assert.ok(inventory.some((c) => c.kind === kind));
  assert.equal(resolveInventoryComponent('setup_admin_role', 'button', inventory).match, 'exact');
  assert.equal(resolveInventoryComponent('eventpg_next_1', 'button', inventory).id, 'eventpg_');
  assert.equal(resolveInventoryComponent('unrecognized', 'button', inventory), null);
  assert.ok(inlineControls().some((c) => c.kind === 'button'));
});

test('offline child environment excludes inherited secrets and protects Windows preload paths', () => {
  process.env.DISCORD_MCP_BOT_TOKEN = 'private-test-credential';
  process.env.GITHUB_TOKEN = 'private-github-credential';
  const env = offlineEnvironment();
  assert.equal(env.DISCORD_MCP_BOT_TOKEN, undefined);
  assert.equal(env.GITHUB_TOKEN, undefined);
  assert.equal(env.DATABASE_PATH, ':memory:');
  assert.equal(env.NODE_OPTIONS.includes('\\'), false);
  delete process.env.DISCORD_MCP_BOT_TOKEN;
  delete process.env.GITHUB_TOKEN;
});

test('offline preload disables dotenv loading and outbound fetch, HTTP and sockets', async () => {
  const code = `const assert = require('node:assert/strict');
    const dotenv = require('./node_modules/dotenv');
    assert.deepEqual(dotenv.config(), {parsed:{}});
    assert.equal(process.env.DATABASE_PATH, ':memory:');
    assert.throws(() => require('node:https').get('https://discord.com'), /disabled/);
    assert.throws(() => require('node:net').connect(443, 'discord.com'), /disabled/);
    assert.rejects(fetch('https://discord.com'), /disabled/).then(() => process.exit(0));`;
  const child = spawn(process.execPath, ['-e', code], {
    cwd: projectRoot,
    env: offlineEnvironment(),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let errors = '';
  child.stderr.on('data', (b) => {
    errors += b;
  });
  child.stdout.resume();
  const exit = await new Promise((accept, reject) => {
    child.once('error', reject);
    child.once('close', accept);
  });
  assert.equal(exit, 0, errors);
});

test('test runner rejects arbitrary suites and cancelled requests', async () => {
  await assert.rejects(runOfflineTests('../../scripts/start-bot'), /Unknown test suite/);
  await assert.rejects(runOfflineTests('components', AbortSignal.abort()), /cancelled/);
});

test('guild and channel scopes fail closed before Discord requests', async () => {
  const { inspector, calls } = fixture([]);
  await assert.rejects(inspector.messages('999999999999999999', channelId), /not allowlisted/);
  await assert.rejects(inspector.messages(guildId, '999999999999999999'), /not allowlisted/);
  await assert.rejects(inspector.messages(guildId, channelId, 100), /Limit/);
  assert.equal(calls.length, 0);
});

test('foreign guild channels and categories cannot expose messages', async () => {
  for (const channel of [
    { guild_id: 'other', type: 0 },
    { guild_id: guildId, type: 4 },
  ]) {
    const { inspector, calls } = fixture([channel]);
    await assert.rejects(inspector.messages(guildId, channelId), /text or announcement/);
    assert.equal(calls.length, 1);
  }
});

test('normal user credentials are rejected', async () => {
  const { inspector, calls } = fixture([
    { guild_id: guildId, type: 0 },
    { id: botId, bot: false },
  ]);
  await assert.rejects(inspector.messages(guildId, channelId), /Only a Discord bot/);
  assert.equal(calls.length, 2);
});

test('live inspection is GET-only, excludes human messages and never returns credentials', async () => {
  const { inspector, calls } = fixture([
    { guild_id: guildId, type: 0 },
    { id: botId, bot: true },
    [
      {
        id: '444444444444444444',
        channel_id: channelId,
        author: { id: botId },
        components: [
          {
            type: 1,
            components: [
              { type: 2, custom_id: 'setup_admin_role', label: 'Admin', style: 1 },
              { type: 2, url: 'https://www.gamereplays.org/', style: 5, label: 'Register' },
            ],
          },
        ],
      },
      { id: '555555555555555555', author: { id: 'human' }, content: 'Private human message' },
    ],
  ]);
  const result = await inspector.messages(guildId, channelId);
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].controls[0].route, 'registered');
  assert.equal(result.messages[0].controls[1].route, 'external-link-no-handler');
  assert.equal(result.messages[0].liveClickVerified, false);
  assert.ok(calls.every((c) => c.options.method === 'GET' && c.options.redirect === 'error'));
  assert.ok(calls.every((c) => c.url.startsWith('https://discord.com/api/v10/')));
  assert.equal(JSON.stringify(result).includes('private-test-credential'), false);
  assert.equal(JSON.stringify(result).includes('Private human message'), false);
});

test('Discord errors do not include response bodies or request credentials', async () => {
  const inspector = new DiscordInspector({
    config: () => ({ guildId, channelIds: [channelId] }),
    token: () => 'secret',
    fetcher: async () =>
      new Response('secret response', { status: 429, headers: { 'retry-after': '30' } }),
  });
  await assert.rejects(
    inspector.messages(guildId, channelId),
    (error) => error.message.includes('HTTP 429') && !error.message.includes('secret'),
  );
  await assert.rejects(inspector.messages(guildId, channelId), /rate limit/);
});

test('unsafe media URLs are omitted and disabled state is retained', () => {
  const result = summarizeMessage({
    components: [{ type: 2, url: 'javascript:alert(1)', disabled: true }],
    embeds: [{ image: { url: 'file:///secret' }, url: 'https://user:password@example.com/' }],
  });
  assert.equal(result.controls[0].url, null);
  assert.equal(result.controls[0].disabled, true);
  assert.equal(result.embeds[0].image, null);
  assert.equal(result.embeds[0].url, null);
});

test('command inspector reports global/guild duplicates without changing registrations', async () => {
  const { inspector, calls } = fixture([
    { id: botId, bot: true },
    { id: guildId },
    [
      { name: 'help', type: 1 },
      { name: 'stats', type: 1 },
    ],
    [{ name: 'help', type: 1 }],
  ]);
  const result = await inspector.commands(guildId);
  assert.deepEqual(result.collisions, ['help']);
  assert.ok(calls.every((c) => c.options.method === 'GET'));
});
