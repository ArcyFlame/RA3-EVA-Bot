# RA3 Community Bot — Production-Readiness Audit

Audited: 2026-07-18 · Codebase: 150 TypeScript files, ~7,730 LOC · discord.js 14.15 · better-sqlite3

Severity legend: 🔴 critical · 🟠 high · 🟡 medium · 🔵 low/style

---

## 1. Broken functionality (bugs)

| # | Sev | File | Issue |
|---|-----|------|-------|
| 1.1 | 🔴 | `src/events/interactionCreate.ts` + `src/interactions/index.ts` | **Modal pipeline is completely broken.** Router resolves modal handlers via `customId.split('_')[0] + '_modal'` (e.g. `clan_create_modal` → `clan_modal`), but modals register under `customId = 'clan_create_modal'` or `customIdPrefix = 'clan_color_modal_'`. No lookup ever matches; prefix-based modals are never even registered (registry only accepts `customId`). Every modal submission replies "This modal is not configured." |
| 1.2 | 🟠 | `src/events/interactionCreate.ts` | 12 hardcoded `await import()` branches for specific button/select customIds duplicate the component registry. Handlers invoked this way run **outside any try/catch** → unhandled promise rejections; two routing systems must be kept in sync (already drifted). |
| 1.3 | 🟠 | `src/events/interactionCreate.ts` | No `Autocomplete` handling — any command adding `.setAutocomplete(true)` would throw "Unknown interaction". No user/role/channel select menu routing (one hardcoded branch only). |
| 1.4 | 🟠 | `src/bot.ts` | `client.on('rateLimit')` — the Client `rateLimit` event is deprecated/removed in discord.js 14.15; it lives on `client.rest` as `rateLimited`. Handler likely never fires. |
| 1.5 | 🟡 | `src/events/guildCreate.ts` | `await guildRepository.findByDiscordId(...)` awaits a **synchronous** better-sqlite3 call (fake-async, misleading). `guild.fetchOwner()` unprotected — throws on API failure and the whole event handler rejects (event registration wrapper has no catch). |
| 1.6 | 🟡 | `src/events/ready.ts` | `db.exec` migration blocks duplicated from the migration file with empty `catch {}` — schema drift lives in two places; failures are silently swallowed. |
| 1.7 | 🟡 | `src/services/twitch-notifier.service.ts` | In-memory `notifiedStreams` dedup map although the schema ships a `twitch_notified_streams` table → duplicate notifications after every restart; dead schema. Map also grows unboundedly. |
| 1.8 | 🟡 | `src/services/twitch-notifier.service.ts` | `stream.thumbnailUrl.replace(...)` without null-check — one malformed stream aborts the whole poll iteration. |

## 2. Memory leaks / event-loop / performance

| # | Sev | File | Issue |
|---|-----|------|-------|
| 2.1 | 🔴 | `src/events/interactionCreate.ts` | `componentCooldowns = new Map()` — one entry per user per component, **never cleaned** → unbounded growth in long-running process (DoS-by-memory). |
| 2.2 | 🟠 | `src/events/ready.ts` | Three `setInterval` loops (presence 2 min, stats panel 10 min, plus notifiers) whose handles are never stored/unref'd → can't stop on shutdown; overlapping executions possible if a tick exceeds the interval. |
| 2.3 | 🟡 | `src/events/ready.ts` | Stats-panel updater calls `ra3StatsService.fetch()` **per guild** instead of once per tick. |
| 2.4 | 🟡 | `src/utils/cooldown.ts` | Expired entries only removed when the same user+command is hit again; no sweep. |

## 3. Security

| # | Sev | File | Issue |
|---|-----|------|-------|
| 3.1 | 🔴 | `src/repositories/guild.repository.ts` | `updateFeature(discordId, columnName, value)` interpolates `columnName` into raw SQL. Currently only reached via whitelisted maps, but it is a loaded-gun public method — any future caller passing user input is instant SQL injection. Must enforce the whitelist *inside* the method. |
| 3.2 | 🔴 | `src/webhook/server.ts` | `YOUTUBE_VERIFY_TOKEN \|\| 'default'` — if the env var is missing, the webhook verification secret is the literal string `"default"` → anyone can verify/forge subscriptions. No `X-Hub-Signature` HMAC verification on POST notifications → forged "new video" notifications possible. |
| 3.3 | 🟠 | `src/utils/permissions.ts` | `isAdmin` checks only the DB-configured role. Guild **owner** and members with Discord `Administrator` permission are denied — and worse, nothing anywhere checks bot owner. No owner-only gate for `/kill`, `/restart`. Debug `console.log` leaks user tags + role IDs to stdout. |
| 3.4 | 🟠 | `src/utils/logger.ts` | No secret redaction: axios/REST errors are logged raw and can contain `client_secret`, tokens, API keys (Twitch token refresh failures log the full axios config). |
| 3.5 | 🟡 | `src/config/env.ts` | Snowflake IDs parsed with `BigInt()` — throws `SyntaxError` on malformed input at import time (crash on boot, unhelpful message). `CHALLONGE_API_KEY!` non-null asserted but documented optional. No URL/format validation for callbacks. No `OWNER_ID` concept at all. |
| 3.6 | 🟡 | `src/webhook/server.ts` | Rate limiter only on POST; GET verify endpoint unlimited. Port hardcoded `8081`. `server: any`. |
| 3.7 | 🟡 | repo | `.gitignore` misses `data/` (live SQLite DB with user data sits in the working tree), `dist/`, `logs/`. |
| 3.8 | 🟡 | `src/services/twitch-notifier.service.ts` | Admin-supplied `customMessage` sent raw — no `@everyone` sanitization (helper exists in `sanitize.ts`, unused here). |

## 4. Error handling

| # | Sev | File | Issue |
|---|-----|------|-------|
| 4.1 | 🟠 | `src/events/index.ts` | Event executes are attached bare: `client.on(name, (...a) => event.execute(bot, ...a))` — a throwing event handler = unhandled rejection. Needs a safe wrapper. |
| 4.2 | 🟠 | `src/events/interactionCreate.ts` | Error replies use raw `interaction.reply({content})` races: no centralized helper; several handlers `.catch(() => {})` (silent failure — the opposite extreme). |
| 4.3 | 🟡 | `src/index.ts` | `unhandledRejection` only logs (ok) but signal handlers are registered inside `RA3Bot.start()` — duplicate registration on any re-start; `stop()` calls `process.exit(0)` making shutdown untestable and non-idempotent. |
| 4.4 | 🟡 | many | Empty `catch {}` blocks (migrations, ready.ts) — silent failures. |

## 5. Architecture / typing / style

| # | Sev | File | Issue |
|---|-----|------|-------|
| 5.1 | 🟠 | `src/bot.ts` | `Command.data: any`, `execute(..., interaction: any)`, `components: Collection<string, any> \| null` — the three central abstractions are untyped; 100+ files inherit the `any`. |
| 5.2 | 🟠 | `src/events/ready.ts` | Event file imports `startLobbyPanelUpdater`/`startMatchPanelUpdater` **from admin command modules**, `wizardViews` from a select-menu module, `setStartTime` from the uptime command — cross-module mutable state; commands act as service containers. |
| 5.3 | 🟡 | `src/database/sqlite.ts` | No `journal_mode=WAL`, no `busy_timeout` → `SQLITE_BUSY` under concurrent webhook+poll writes; DB opened at module import (side effect). No migration versioning (`schema_migrations`) — migrations are run-always with try/catch de-dup. |
| 5.4 | 🟡 | `src/services/match-reminder.service.ts`, `src/interactions/modals/score-modal.modal.ts` | Direct `db.prepare(...)` bypasses the repository layer. |
| 5.5 | 🟡 | `package.json` | Dead deps: `sqlite3` + `@types/sqlite3`, `ioredis` (zero imports). `lint` script uses `--ext` → **broken** with flat config (ESLint flat mode rejects the flag). |
| 5.6 | 🟡 | `eslint.config.js` | Flat config lacks Node globals (`process`, `Buffer`, `setInterval`… → 30+ false `no-undef`) and uses base `no-unused-vars` instead of `@typescript-eslint/no-unused-vars` (false positives on constructor parameter properties). 199 problems total, mostly config noise hiding real ones. |
| 5.7 | 🔵 | repo | 12 stray `console.*` calls across 11 files (should be `logger`). |
| 5.8 | 🔵 | `src/config/env.ts` | `ADMIN_ROLE_ID` parsed but never used (dead config). |
| 5.9 | 🔵 | style | Mixed 2/4-space indentation, inconsistent quotes across files; prettier config exists but wasn't enforced. |

## 6. What is already good (keep)

- Strict `tsconfig` (`strict`, `noImplicitReturns`, `noUnusedLocals`) — typecheck passes clean.
- Repository pattern over better-sqlite3 with parameter binding (no string-built queries with user data).
- Cooldown utility, sanitize helpers, winston logger exist — they are just under-used.
- Webhook has rate limiting on the hot path and a health endpoint.
- Migration file ships a full `down()`.

## Fix plan (this branch)

1. **Foundation** — typed `Command`/component contracts, validated `env`, redacting logger, safe event wrapper, centralized interaction error helper.
2. **Router** — single registry-driven router: exact + prefix matching for buttons/selects/modals, autocomplete support, bounded component cooldowns, guild guards.
3. **Database** — WAL + busy_timeout, versioned migrations, whitelist-enforced column updates, remove DDL from `ready.ts`.
4. **Security** — permission system v2 (owner/admin/Discord-permissions), webhook token fail-fast + optional HMAC, log redaction, sanitize notifier custom messages, `.gitignore` hygiene.
5. **Sweep** — apply the new primitives across all 100+ commands/interactions/services (null-checks, validation, deferral patterns, logger).
6. **Tooling** — fix ESLint config + lint script, drop dead deps, prettier pass.
7. **Docs** — README (architecture/config/deployment/troubleshooting) + `.env.example`.
