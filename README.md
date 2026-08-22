# E.V.A — Red Alert 3 Community Bot

A Discord bot for the **Command & Conquer: Red Alert 3** community, built with
discord.js v14, TypeScript, better-sqlite3 and chartjs-node-canvas. Named after
E.V.A, the Allied command voice.

## Features

- **Live community stats** — online players from C&C Online and RA3BattleNet,
  leaderboards (1v1/2v2/3v3), most-played maps and faction popularity, with
  Red Alert-styled charts (online 24h / new players 30d / online 30d) and a
  persistent stats panel for your channel.
- **Tournament pipeline** — automatically scans the GameReplays.org RA3 esports
  portal and forum: announcements, sign-up threads, player rosters, prize
  pools, map pools and Challonge brackets (including multi-bracket events like
  qualifiers + playoffs). `/results`, `/matches` and `/events` show podium and
  standings; check-ins, score reports and referee review are built in. Older
  tournament winners are indexed from the full esports forum history.
- **Player profiles** — `/link` manages Shatabrick and RA3BattleNet identities.
  `/profile` keeps both platforms separate and shows live rank, Elo and W/L
  wherever the platform currently exposes that data.
- **News & content feeds** — current GameReplays RA3 portal news and ModDB RA3 articles
  (`/mods`), Twitch streams and YouTube uploads (RSS-based, no API key),
  posted to the channels you choose, always deduplicated.
- **Community tools** — `/pickmap` with verified tournament map pools, clan
  manager, tips, moderation utilities, per-guild
  game selection (RA3 / Kane's Wrath / Generals Evolution), i18n (EN/RU/ZH)
  and an admin setup wizard.
- **Direct messages** — safe public commands work in DMs by default. The bot
  owner can switch this off from `/toggle`; server-only and staff commands stay
  locked to servers.

## Quick start

Requires **Node.js 20.18.1 or newer** and a Discord bot token. Optional API
credentials are documented in `.env.example`.

```bash
npm install
cp .env.example .env   # fill in DISCORD_TOKEN (everything else is optional)
npm run build
node dist/index.js
```

Then run `/bot_setup` in your server to choose the admin role, channels and
features. `/help` lists everything. Useful scripts:

| Command | Purpose |
| --- | --- |
| `npm run build` | Compile to `dist/` |
| `npm run typecheck` | TypeScript check |
| `npm test` | Test suite (vitest) |
| `npm run diagnose` | Configuration diagnostics |
| `npm run seed:masters` | Seed the Hall of Fame list |
| `npm run backfill:tournament-winners` | Resume the historical tournament scan |

## Architecture

```
src/
  bot.ts               composition root (client, registries, lifecycle)
  config/env.ts        validated, typed configuration
  database/            better-sqlite3 (WAL) + versioned migrations
  repositories/        data access (parameterized SQL)
  services/            external APIs + pollers (Challonge, Twitch, YouTube, ModDB, stats)
  commands/            slash commands, grouped by domain
  interactions/        buttons / modals / select menus
  events/              discord.js event handlers
  utils/               logger, permissions, cooldown, sanitize, hmac, charts, i18n
  webhook/server.ts    PubSubHubbub webhook (YouTube) + health endpoint
```

Permissions are layered: `owner` (`OWNER_ID`, gates `/kill` and `/restart`) →
`admin` (guild owner, Administrator permission or configured admin role) →
`referee` → `moderator`.

## Credits

Built for the Red Alert 3 community by **Arcy**. Data from
[GameReplays.org](https://www.gamereplays.org), [RA3BattleNet](https://ra3battle.cn),
[C&C Online](https://cnc-online.net), Shatabrick and
[Challonge](https://challonge.com).

## License

Copyright © 2026 ArcyFlame. Released under the
[GNU General Public License v3.0 or later](LICENSE).
