const fs = require('node:fs');
const path = require('node:path');
const { connectDatabase, disconnectDatabase } = require('../dist/database/connection');
const { ra3StatsService } = require('../dist/services/ra3-stats.service');
const { chartTrackingNote, generateBarChart } = require('../dist/utils/charts');

async function main() {
  const outputDirectory = path.resolve(process.argv[2] || './data/chart-preview');
  fs.mkdirSync(outputDirectory, { recursive: true });
  await connectDatabase();
  const stats = await ra3StatsService.fetch();
  const charts = [
    ['online_players_last_24_hours.png', stats.online_last_24h, 'Online Players (Last 24 Hours)', 'Reds_r', stats.history_started_at],
    ['new_players_last_30_days.png', stats.new_players_last_30d, 'New Players (Last 30 Days)', 'Blues_r', stats.new_player_tracking_started_at],
    ['online_players_last_30_days.png', stats.online_last_30d, 'Online Players (Last 30 Days)', 'YlOrBr_r', stats.history_started_at],
  ];
  for (const [filename, values, title, palette, startedAt] of charts) {
    const buffer = await generateBarChart(values, title, palette, chartTrackingNote(startedAt));
    fs.writeFileSync(path.join(outputDirectory, filename), buffer);
  }
  process.stdout.write(`${JSON.stringify({
    outputDirectory,
    historyStartedAt: stats.history_started_at,
    newPlayerTrackingStartedAt: stats.new_player_tracking_started_at,
    online24h: stats.online_last_24h,
    newPlayers30d: stats.new_players_last_30d,
    online30d: stats.online_last_30d,
  })}\n`);
  await disconnectDatabase();
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
