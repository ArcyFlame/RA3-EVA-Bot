import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../src/database/sqlite';
import { up as up001 } from '../../src/database/migrations/001_initial_schema';
import { up as up009 } from '../../src/database/migrations/009_tournament_pipeline_games';
import { up as up015 } from '../../src/database/migrations/015_tournament_workflow';
import { up as up016 } from '../../src/database/migrations/016_app_settings_and_deliveries';
import { up as up022 } from '../../src/database/migrations/022_referee_checkin_alerts';
import { up as up037 } from '../../src/database/migrations/037_security_boundaries';
import { up as up038 } from '../../src/database/migrations/038_tournament_authority';

beforeAll(() => {
  up001();
  up009();
  up015();
  up016();
  up022();
  up037();
  db.prepare('INSERT INTO users(discord_id, username) VALUES(?,?)').run('referee', 'Referee');
  db.prepare('INSERT INTO tournament_events(id,event_url,title,announced_at) VALUES(?,?,?,?)').run(
    1,
    'https://example.com/cup',
    'Old Cup',
    '2026-01-01',
  );
  db.prepare(
    'INSERT INTO tournament_participants(event_id,source,name,discord_id,discord_binding_verified,checked_in) VALUES(?,?,?,?,?,?)',
  ).run(1, 'discord', 'Élite', 'player', 1, 1);
  db.prepare('INSERT INTO app_settings(key,value) VALUES(?,?)').run(
    'tournament-organizer:1',
    '111111111111111111',
  );
  up038();
});

describe('migration from implicit authority', () => {
  it('preserves local registrations and organizer assignment without inventing external identity', () => {
    expect(
      db
        .prepare(
          'SELECT name,discord_id,checked_in,discord_binding_verified,external_tournament_id,external_participant_id FROM tournament_participants',
        )
        .get(),
    ).toEqual({
      name: 'Élite',
      discord_id: 'player',
      checked_in: 1,
      discord_binding_verified: 1,
      external_tournament_id: null,
      external_participant_id: null,
    });
    expect(
      db.prepare('SELECT value FROM app_settings WHERE key=?').get('tournament-organizer:1'),
    ).toEqual({ value: '111111111111111111' });
    expect(db.prepare('SELECT COUNT(*) AS n FROM tournament_write_brackets').get()).toEqual({
      n: 0,
    });
    expect(db.pragma('quick_check', { simple: true })).toBe('ok');
  });
  it('keeps the referee record but requires fresh consent instead of retaining the old default-on flag', () => {
    expect(db.prepare('SELECT username,referee_checkin_dm_enabled FROM users').get()).toEqual({
      username: 'Referee',
      referee_checkin_dm_enabled: 0,
    });
  });
});
