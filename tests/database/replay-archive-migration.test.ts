import { afterAll, describe, expect, it } from 'vitest';
import { db } from '../../src/database/sqlite';
import { up } from '../../src/database/migrations/036_replay_archive';
afterAll(() => db.close());
describe('schema 36 replay archive migration', () => {
  it('preserves existing cards and votes while adding optional archive fields idempotently', () => {
    db.exec(`CREATE TABLE replay_rating_cards(id INTEGER PRIMARY KEY, guild_id TEXT, source_message_id TEXT, card_message_id TEXT, bonus_awarded INTEGER, closed INTEGER);
      CREATE TABLE replay_rating_votes(card_id INTEGER, user_id TEXT, vote INTEGER);
      INSERT INTO replay_rating_cards VALUES(1,'guild','source','card',15,0);
      INSERT INTO replay_rating_votes VALUES(1,'voter',1);`);
    db.transaction(up)();
    db.transaction(up)();
    expect(db.prepare('SELECT * FROM replay_rating_cards').get()).toEqual({
      id: 1,
      guild_id: 'guild',
      source_message_id: 'source',
      card_message_id: 'card',
      bonus_awarded: 15,
      closed: 0,
      archive_attachment_id: null,
      description: null,
      revision: 0,
    });
    expect(db.prepare('SELECT * FROM replay_rating_votes').get()).toEqual({
      card_id: 1,
      user_id: 'voter',
      vote: 1,
    });
    expect(db.pragma('quick_check', { simple: true })).toBe('ok');
  });
});
