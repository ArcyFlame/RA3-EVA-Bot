const { connectDatabase, disconnectDatabase } = require('../dist/database/connection');
const { forumScanner } = require('../dist/services/forum-scanner.service');

async function main() {
  await connectDatabase();
  const result = await forumScanner.backfillHistoricalWinners();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  await disconnectDatabase();
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
