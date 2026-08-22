#!/usr/bin/env node
/**
 * Bot diagnostics: gathers everything needed to answer "what's wrong with
 * the bot" in one report — env/config, database state, external API
 * reachability, chart native deps, and recent errors from the log file.
 *
 * Run with:  npm run diagnose
 * Plain Node (no build step) so it works even when dist/ is stale.
 */

const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

const ROOT = path.join(__dirname, '..');
let failures = 0;

// The only hosts this script may talk to. Everything else is refused before
// any socket is opened — no URL is ever built from free-form input.
const HOST_ALLOWLIST = new Set([
  'cnc-online.net',
  'api.ra3battle.cn',
  'api.challonge.com',
  'api.steampowered.com',
]);

function assertAllowedUrl(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') {
    throw new Error(`refused non-https protocol: ${parsed.protocol}`);
  }
  if (!HOST_ALLOWLIST.has(parsed.hostname)) {
    throw new Error(`host not in allowlist: ${parsed.hostname}`);
  }
}

function section(title) {
  console.log(`\n${'='.repeat(64)}\n  ${title}\n${'='.repeat(64)}`);
}

function ok(msg) {
  console.log(`  [OK]   ${msg}`);
}

function warn(msg) {
  console.log(`  [WARN] ${msg}`);
}

function fail(msg) {
  failures += 1;
  console.log(`  [FAIL] ${msg}`);
}

const PLACEHOLDER_PATTERNS = [
  /^your[-_]/i,
  /your[-_]?api[-_]?key/i,
  /changeme|change[-_]me/i,
  /^x+$/,
  /placeholder/i,
  /^test[-_]?key/i,
];

function looksLikePlaceholder(value) {
  return PLACEHOLDER_PATTERNS.some((re) => re.test(value));
}

function mask(value) {
  if (!value) return '(not set)';
  return `${value.slice(0, 4)}...${value.slice(-2)} (${value.length} chars)`;
}

// Find the newest *.log file in the fixed directories the bot writes to.
// Paths are hardcoded — nothing from the environment reaches file access.
function findLogFile() {
  const candidates = [];
  for (const dir of [path.join(ROOT, 'logs'), ROOT]) {
    try {
      for (const entry of fs.readdirSync(dir)) {
        if (entry.endsWith('.log')) candidates.push(path.join(dir, entry));
      }
    } catch {
      // directory does not exist — fine
    }
  }
  if (candidates.length === 0) return undefined;
  return candidates.reduce((newest, p) =>
    fs.statSync(p).mtimeMs > fs.statSync(newest).mtimeMs ? p : newest,
  );
}

// ---------------------------------------------------------------- env config
section('Environment');
const required = ['DISCORD_TOKEN'];
const optionalCreds = [
  'CHALLONGE_API_KEY',
  'TWITCH_CLIENT_ID',
  'TWITCH_CLIENT_SECRET',
  'TWITCH_REFRESH_TOKEN',
  'YOUTUBE_API_KEY',
  'STEAM_API_KEY',
];

for (const key of required) {
  if (process.env[key]) {
    if (looksLikePlaceholder(process.env[key])) fail(`${key} looks like a placeholder — set the real value`);
    else ok(`${key} = ${mask(process.env[key])}`);
  } else fail(`${key} is NOT set — the bot cannot start`);
}
for (const key of optionalCreds) {
  if (process.env[key]) {
    if (looksLikePlaceholder(process.env[key])) warn(`${key} looks like a placeholder — its features will not work`);
    else ok(`${key} = ${mask(process.env[key])}`);
  } else warn(`${key} not set — its notifications/scanning are disabled`);
}
console.log(`  LOG_FILE = ${process.env.LOG_FILE || '(console only)'}`);
console.log(`  LOG_LEVEL = ${process.env.LOG_LEVEL || 'info (default)'}`);

// ------------------------------------------------------------------ database
section('Database');
const dbPath = path.join(ROOT, 'data', 'bot.db');
try {
  if (fs.existsSync(dbPath)) {
    ok(
      `database file: ${path.relative(ROOT, dbPath)} (${fs
        .statSync(dbPath)
        .size.toLocaleString()} bytes)`,
    );
    const Database = require('better-sqlite3');
    const db = new Database(dbPath, { readonly: true });
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r) => r.name);
    console.log(`  tables (${tables.length}): ${tables.join(', ')}`);

    for (const table of tables) {
      if (table.startsWith('sqlite_') || table.startsWith('_')) continue;
      const { n } = db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get();
      const marker = n === 0 ? 'WARN' : 'OK';
      console.log(`  [${marker.padEnd(5)}] ${table}: ${n} rows`);
    }

    // Guild notification configuration — the usual reason "the bot doesn't
    // post on selected channels" is channels never saved or features off.
    if (tables.includes('guilds')) {
      const guilds = db.prepare('SELECT * FROM guilds').all();
      for (const g of guilds) {
        const cols = Object.entries(g)
          .filter(([k, v]) => /enabled|channel/i.test(k))
          .map(([k, v]) => `${k}=${v ?? 'NULL'}`);
        console.log(`  guild ${g.discord_id || g.id}: ${cols.join(', ')}`);
      }
      if (guilds.length === 0) warn('no guilds registered — run /setup_bot on your server');
    }
    if (tables.includes('notification_channels')) {
      const rows = db.prepare('SELECT * FROM notification_channels').all();
      for (const r of rows) {
        console.log(`  notification_channel: ${JSON.stringify(r)}`);
      }
      if (rows.length === 0) {
        warn('no notification channels configured — /setup_bot → Notification Channels');
      }
    }
    db.close();
  } else {
    fail(`database not found at ${path.relative(ROOT, dbPath)} (fresh start will create it)`);
  }
} catch (err) {
  fail(`database check error: ${err.message}`);
}

// ------------------------------------------------------------- external APIs
section('External APIs');
const axios = require('axios');

async function ping(name, url, extraParams, validate) {
  try {
    assertAllowedUrl(url);
  } catch (err) {
    fail(`${name} — ${err.message}`);
    return;
  }
  const started = Date.now();
  try {
    const res = await axios.get(url, { timeout: 10_000, params: extraParams });
    const ms = Date.now() - started;
    const extra = validate ? validate(res.data) : '';
    ok(`${name} — HTTP ${res.status} in ${ms}ms ${extra}`);
  } catch (err) {
    const reason = err.response
      ? `HTTP ${err.response.status}`
      : err.code === 'ECONNABORTED'
        ? 'timeout'
        : err.code || err.message;
    fail(`${name} — ${reason}`);
  }
}

(async () => {
  await ping(
    'C&C Online serverinfo',
    'https://cnc-online.net/api/serverinfo/',
    { site: 'cnconline' },
    (d) => (d?.ra3 ? '(ra3 keys present)' : '(WARNING: no ra3 key in payload)'),
  );
  await ping('RA3BattleNet API', 'https://api.ra3battle.cn/api/server/status/detail', undefined, (d) =>
    d && typeof d === 'object' ? '' : '(unexpected payload)',
  );
  if (process.env.CHALLONGE_API_KEY) {
    await ping(
      'Challonge',
      'https://api.challonge.com/v1/tournaments.json',
      { api_key: process.env.CHALLONGE_API_KEY },
      (d) => (Array.isArray(d) ? `(visible tournaments: ${d.length})` : '(check key)'),
    );
  } else {
    warn('Challonge skipped — CHALLONGE_API_KEY not set (tournament scanning disabled)');
  }
  if (process.env.STEAM_API_KEY) {
    await ping('Steam Web API', 'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/', {
      key: process.env.STEAM_API_KEY,
      steamids: '76561197960435530',
    });
  } else {
    warn('Steam skipped — STEAM_API_KEY not set');
  }

  // ---------------------------------------------------------- chart rendering
  section('Chart rendering (native canvas deps)');
  try {
    const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
    const renderer = new ChartJSNodeCanvas({ width: 100, height: 100 });
    const buf = await renderer.renderToBuffer({
      type: 'bar',
      data: { labels: ['a'], datasets: [{ data: [1] }] },
    });
    ok(`chartjs-node-canvas rendered a ${buf.length.toLocaleString()}-byte PNG`);
  } catch (err) {
    fail(`chart rendering failed: ${err.message}`);
  }

  // ------------------------------------------------------------- recent errors
  section('Recent errors from log file');
  try {
    const logPath = findLogFile();
    if (!logPath) {
      warn('no .log file found in ./ or ./logs/ — set LOG_FILE in .env to persist bot logs');
    } else {
      ok(`reading ${path.relative(ROOT, logPath)} (newest .log found)`);
      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
      const parsed = lines.flatMap((l) => {
        try {
          return [JSON.parse(l)];
        } catch {
          return [];
        }
      });
      const errors = parsed.filter((e) => e.level === 'error' || e.level === 'warn');
      const last = errors.slice(-15);
      if (last.length === 0) {
        ok(`no error/warn entries in the last ${parsed.length.toLocaleString()} log lines`);
      } else {
        for (const e of last) {
          console.log(`  [${e.level}] ${e.timestamp || ''} ${String(e.message).slice(0, 200)}`);
        }
        console.log(
          `  (${errors.length.toLocaleString()} error/warn entries total — showing last 15)`,
        );
      }
    }
  } catch (err) {
    warn(`log file check error: ${err.message}`);
  }

  // ------------------------------------------------------------------- summary
  section('Summary');
  if (failures === 0) {
    console.log('  All checks passed. If something still misbehaves, look at the');
    console.log('  WARN lines above (missing credentials / empty config are the usual cause).');
  } else {
    console.log(`  ${failures} check(s) FAILED — see [FAIL] lines above.`);
  }
  process.exit(failures === 0 ? 0 : 1);
})();
