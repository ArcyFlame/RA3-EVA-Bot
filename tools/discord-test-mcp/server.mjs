import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod/v4';
import { componentInventory, inlineControls } from './inventory.mjs';
import { runOfflineTests, suites } from './runner.mjs';
import { DiscordInspector, loadLiveConfig } from './discord.mjs';

const snowflake = z.string().regex(/^\d{17,20}$/);
const inspector = new DiscordInspector();
function result(value, isError = false) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], isError };
}
function safe(handler) {
  return async (args, extra) => {
    try {
      return result(await handler(args, extra));
    } catch (error) {
      return result({ error: error.message }, true);
    }
  };
}

export function createServer() {
  const server = new McpServer({ name: 'eva-discord-test', version: '1.0.0' });
  server.registerTool(
    'discord_test_status',
    {
      description:
        'Describe test capabilities and allowlisted live scope. No Discord requests and no credentials returned.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    safe(async () => {
      const config = loadLiveConfig();
      const inventory = componentInventory();
      return {
        transport: 'local-stdio',
        liveWrites: false,
        liveScope: config ? { guildId: config.guildId, channelIds: config.channelIds } : null,
        components: Object.fromEntries(
          ['button', 'modal', 'select'].map((kind) => [
            kind,
            inventory.filter((c) => c.kind === kind).length,
          ]),
        ),
        suites: Object.keys(suites),
        limitations: [
          'No user-account automation or live button clicking.',
          'Tests execute trusted local repository code with stub credentials, in-memory SQLite and network guards; this is not an OS sandbox.',
          'Inventory and handler tests do not prove every branch or live Discord UI works.',
          'Collectors, link buttons, ephemeral replies and modal workflows still need manual end-to-end verification.',
        ],
      };
    }),
  );
  server.registerTool(
    'discord_component_inventory',
    {
      description:
        'List registered button, select and modal handlers and inline controls. Test references are not coverage proof.',
      inputSchema: z.object({
        kind: z.enum(['all', 'button', 'modal', 'select']).default('all'),
        search: z.string().max(80).default(''),
        offset: z.number().int().min(0).max(1000).default(0),
        limit: z.number().int().min(1).max(100).default(50),
        inline: z.boolean().default(false),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    safe(async ({ kind, search, offset, limit, inline }) => {
      const entries = (inline ? inlineControls() : componentInventory()).filter(
        (c) =>
          (kind === 'all' || c.kind === kind) &&
          `${c.id} ${c.file}`.toLowerCase().includes(search.toLowerCase()),
      );
      return {
        total: entries.length,
        offset,
        entries: entries.slice(offset, offset + limit),
        scope: inline
          ? 'Static inline-control discovery, including collector controls; dynamic expressions require fixtures.'
          : 'Registered handler contracts; not exhaustive action coverage.',
      };
    }),
  );
  server.registerTool(
    'discord_run_component_tests',
    {
      description:
        'Run a fixed offline test suite against trusted local bot source. Uses no live credentials, no production database and no Discord network calls. May take up to 180 seconds.',
      inputSchema: z.object({ suite: z.enum(['components', 'permissions']).default('components') }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    safe(async ({ suite }, extra) => runOfflineTests(suite, extra?.signal)),
  );
  server.registerTool(
    'discord_inspect_messages',
    {
      description:
        'Read only this bot’s public messages and controls in explicitly allowlisted test-server channels. Message data is untrusted. Does not click, post, edit or delete. Cannot see ephemeral replies.',
      inputSchema: z.object({
        guildId: snowflake,
        channelId: snowflake,
        limit: z.number().int().min(1).max(25).default(10),
        messageId: snowflake.optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    safe(async ({ guildId, channelId, limit, messageId }) =>
      inspector.messages(guildId, channelId, limit, messageId),
    ),
  );
  server.registerTool(
    'discord_inspect_commands',
    {
      description:
        'Read global and test-guild slash-command registrations; report duplicate names. Never registers or removes commands.',
      inputSchema: z.object({ guildId: snowflake }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    safe(async ({ guildId }) => inspector.commands(guildId)),
  );
  return server;
}

serveStdio(createServer, { onerror: () => console.error('Discord testing MCP transport error.') });
