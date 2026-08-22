// Runs before every test file is imported. `src/config/env` reads these at
// module load, so they must be set before anything imports a module that
// transitively imports `config/env`.
process.env.DISCORD_TOKEN = 'test-token-0000000000000000';
process.env.DATABASE_PATH = ':memory:';
process.env.OWNER_ID = '123456789012345678';
