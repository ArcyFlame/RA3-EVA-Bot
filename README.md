# E.V.A - RA3 & Generals Evolution Community Bot

A Discord bot for **Command & Conquer: Red Alert 3** and **Generals Evolution**,
built with discord.js v14, TypeScript, better-sqlite3 and chartjs-node-canvas.
Each Discord server selects its game, sources and features in the setup wizard.

## Features

- **Game-aware stats** - both games can use C&C Online and RA3BattleNet. Generals
  Evolution online counts include only players identified in its lobbies by map
  or platform mod metadata. First-seen GenEvo lobby identities power its New
  Players chart, and its faction page is ready for USA, China, GLA and all nine
  sub-factions when a compatible statistics API becomes available. RA3BattleNet seasons and
  Masters remain RA3-only.
  Eight-player Generals Evolution games are shown as experimental, not as a
  supported 4v4 mode.
- **Tournament pipeline** - scans the GameReplays.org RA3 esports portal and
  forum plus official Generals Evolution announcements: sign-up links, rosters, prize
  pools, map pools and Challonge brackets (including multi-bracket events like
  qualifiers + playoffs). `/results`, `/matches` and `/events` show podium and
  standings; check-ins, score reports and referee review are built in. Older
  tournament winners are indexed from the full esports forum history.
- **Player profiles** - `/link` manages Shatabrick and RA3BattleNet identities.
  `/profile` reads Shatabrick's public rank pages and shows separate Unranked,
  Ranked and Clan records alongside RA3BattleNet records. Season history is
  shown only for Red Alert 3.
- **News & content feeds** - current GameReplays RA3 news or the official
  Generals Evolution ModDB feed, plus game-filtered ModDB, Twitch and YouTube
  posts. Feeds are deduplicated and seed only their newest item in empty channels.
- **Community tools** - `/pickmap` with verified tournament map pools, clan
  manager, tips, moderation utilities, per-guild
  game selection (RA3 / Generals Evolution), game-specific maps and tips,
  i18n (EN/RU/ZH)
  and an admin setup wizard.
- **Direct messages** - safe public commands work in DMs by default. The bot
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

| Command                               | Purpose                               |
| ------------------------------------- | ------------------------------------- |
| `npm run build`                       | Compile to `dist/`                    |
| `npm run typecheck`                   | TypeScript check                      |
| `npm test`                            | Test suite (vitest)                   |
| `npm run diagnose`                    | Configuration diagnostics             |
| `npm run seed:masters`                | Seed the Hall of Fame list            |
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

Built for the Command & Conquer community by **Arcy**. Data from
[GameReplays.org](https://www.gamereplays.org), [RA3BattleNet](https://ra3battle.cn),
[C&C Online](https://cnc-online.net), Shatabrick and
[Challonge](https://challonge.com), with Generals Evolution updates from its
[official ModDB page](https://www.moddb.com/mods/command-and-conquer-generals-evolution).
Generals Evolution charts use Miedinger Book by
[indestructible type\*](https://github.com/indestructible-type/Miedinger), distributed under the
SIL Open Font License 1.1.

## License

Copyright © 2026 ArcyFlame. Released under the
[GNU General Public License v3.0 or later](LICENSE).
