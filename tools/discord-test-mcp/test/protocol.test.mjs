import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { projectRoot } from '../inventory.mjs';
import { join } from 'node:path';

test(
  'real MCP client initializes, lists and calls the stdio tools',
  { timeout: 60_000 },
  async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(projectRoot, 'tools/discord-test-mcp/server.mjs')],
      cwd: projectRoot,
      stderr: 'pipe',
    });
    let errors = '';
    transport.stderr.on('data', (data) => {
      errors += data;
    });
    const client = new Client({ name: 'eva-mcp-protocol-test', version: '1.0.0' });
    try {
      await client.connect(transport);
      const { tools } = await client.listTools();
      assert.equal(tools.length, 5);
      const status = await client.callTool({ name: 'discord_test_status', arguments: {} });
      assert.equal(status.isError, false);
      assert.equal(JSON.parse(status.content[0].text).liveWrites, false);
      const inventory = await client.callTool({
        name: 'discord_component_inventory',
        arguments: { kind: 'button', limit: 2 },
      });
      assert.equal(inventory.isError, false);
      assert.equal(JSON.parse(inventory.content[0].text).entries.length, 2);
      const denied = await client.callTool({
        name: 'discord_inspect_messages',
        arguments: {
          guildId: '999999999999999999',
          channelId: '999999999999999999',
        },
      });
      assert.equal(denied.isError, true);
      assert.match(denied.content[0].text, /not allowlisted/);
      const invalid = await client.callTool({
        name: 'discord_run_component_tests',
        arguments: { suite: 'arbitrary-shell-command' },
      });
      assert.equal(invalid.isError, true);
      const tests = await client.callTool(
        { name: 'discord_run_component_tests', arguments: { suite: 'permissions' } },
        { timeout: 45_000 },
      );
      assert.equal(tests.isError, false);
      const report = JSON.parse(tests.content[0].text);
      assert.equal(report.success, true, JSON.stringify(report.failures));
      assert.ok(report.passed > 30);
      assert.equal(report.isolation.database, ':memory:');
    } finally {
      await client.close();
    }
    assert.equal(errors.includes('private-test-credential'), false);
  },
);
