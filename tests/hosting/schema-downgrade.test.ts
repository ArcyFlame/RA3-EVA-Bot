import { expect, it } from 'vitest';
import { connectDatabase, LATEST_SCHEMA_VERSION } from '../../src/database/connection';
import { db } from '../../src/database/sqlite';

it('refuses a database newer than the supported migration registry before applying changes', async () => {
  await connectDatabase();
  db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(
    LATEST_SCHEMA_VERSION + 1,
    'future-schema',
  );
  try {
    await expect(connectDatabase()).rejects.toThrow('unsafe downgrade');
    expect(db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()).toEqual({
      version: LATEST_SCHEMA_VERSION + 1,
    });
  } finally {
    db.prepare('DELETE FROM schema_migrations WHERE version = ?').run(LATEST_SCHEMA_VERSION + 1);
  }
});
