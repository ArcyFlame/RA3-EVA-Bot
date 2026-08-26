import { addColumnIfMissing, db } from '../sqlite';

export function up(): void {
  addColumnIfMissing('guilds', 'cnc_online_enabled', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('guilds', 'ra3battle_net_enabled', 'INTEGER NOT NULL DEFAULT 1');

  // Move the retired secondary setup to Generals Evolution. Unknown legacy
  // values fall back to Red Alert 3 instead of leaving a broken configuration.
  db.prepare("UPDATE guilds SET game = 'genevo' WHERE game = 'kw'").run();
  db.prepare("UPDATE guilds SET game = 'ra3' WHERE game NOT IN ('ra3', 'genevo')").run();
  db.prepare("UPDATE guilds SET ra3battle_net_enabled = 1 WHERE game = 'genevo'").run();

  addColumnIfMissing('news_items', 'game', "TEXT NOT NULL DEFAULT 'ra3'");
  db.exec('CREATE INDEX IF NOT EXISTS idx_news_items_game_posted ON news_items (game, posted_at)');

  addColumnIfMissing('tournament_events', 'game', "TEXT NOT NULL DEFAULT 'ra3'");
  // Preserve unrelated historical records, but keep them out of both active
  // game feeds. They may still be inspected directly in the database.
  db.prepare(
    `UPDATE tournament_events
     SET game = 'archived'
     WHERE lower(title) LIKE '%kane%wrath%'
        OR lower(title) LIKE '%tiberium%'
        OR lower(title) LIKE '%tiberian%'
        OR lower(title) LIKE '%c&c 3%'`,
  ).run();
  db.prepare(
    `UPDATE tournament_events
     SET game = 'genevo'
     WHERE lower(title) LIKE '%generals evolution%'
        OR lower(title) LIKE '%genevo%'
        OR lower(title) LIKE '%gen evo%'`,
  ).run();
  db.exec('CREATE INDEX IF NOT EXISTS idx_tournament_events_game ON tournament_events (game)');

  addColumnIfMissing('stats_snapshots', 'game', "TEXT NOT NULL DEFAULT 'ra3'");
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_stats_snapshots_game_created ON stats_snapshots (game, created_at)',
  );
}

export function down(): void {
  // Columns are retained because removing SQLite columns would require table
  // rebuilds and could discard live server settings.
}
