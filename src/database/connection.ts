import { db } from './sqlite';
import { up as up001, down as down001 } from './migrations/001_initial_schema';
import { up as up002, down as down002 } from './migrations/002_youtube_notified_videos';
import { up as up003, down as down003 } from './migrations/003_stats_panel_mode';
import { up as up004, down as down004 } from './migrations/004_clans_guild_id';
import { up as up005, down as down005 } from './migrations/005_tournament_sign_up_url';
import { up as up006, down as down006 } from './migrations/006_stats_history_and_usage';
import { up as up007, down as down007 } from './migrations/007_news_language_menus';
import { up as up008, down as down008 } from './migrations/008_ra3b_username';
import { up as up009, down as down009 } from './migrations/009_tournament_pipeline_games';
import { up as up010, down as down010 } from './migrations/010_tournament_brackets';
import { up as up011, down as down011 } from './migrations/011_ra3b_persona_id';
import { up as up012, down as down012 } from './migrations/012_seen_players';
import { up as up013, down as down013 } from './migrations/013_panel_charts_message';
import { logger } from '../utils/logger';

interface Migration {
  version: number;
  name: string;
  up: () => void;
  down: () => void;
}

/** Ordered migration registry — append new migrations, never edit applied ones. */
const migrations: Migration[] = [
  { version: 1, name: '001_initial_schema', up: up001, down: down001 },
  { version: 2, name: '002_youtube_notified_videos', up: up002, down: down002 },
  { version: 3, name: '003_stats_panel_mode', up: up003, down: down003 },
  { version: 4, name: '004_clans_guild_id', up: up004, down: down004 },
  { version: 5, name: '005_tournament_sign_up_url', up: up005, down: down005 },
  { version: 6, name: '006_stats_history_and_usage', up: up006, down: down006 },
  { version: 7, name: '007_news_language_menus', up: up007, down: down007 },
  { version: 8, name: '008_ra3b_username', up: up008, down: down008 },
  { version: 9, name: '009_tournament_pipeline_games', up: up009, down: down009 },
  { version: 10, name: '010_tournament_brackets', up: up010, down: down010 },
  { version: 11, name: '011_ra3b_persona_id', up: up011, down: down011 },
  { version: 12, name: '012_seen_players', up: up012, down: down012 },
  { version: 13, name: '013_panel_charts_message', up: up013, down: down013 },
];

function ensureMigrationsTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export async function connectDatabase(): Promise<void> {
  ensureMigrationsTable();

  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>).map(
      (r) => r.version,
    ),
  );

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    // better-sqlite3 transactions are synchronous; a failed migration rolls
    // back fully instead of leaving a half-applied schema.
    const apply = db.transaction(() => {
      migration.up();
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(
        migration.version,
        migration.name,
      );
    });
    apply();
    logger.info(`Applied migration ${migration.version} (${migration.name})`);
  }

  logger.info('Database schema up to date');
}

export async function disconnectDatabase(): Promise<void> {
  db.close();
  logger.info('Database connection closed');
}
