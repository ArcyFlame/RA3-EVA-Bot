import { describe, it, expect, beforeAll } from 'vitest';
import { up as up001 } from '../../src/database/migrations/001_initial_schema';
import { up as up007 } from '../../src/database/migrations/007_news_language_menus';
import { up as up008 } from '../../src/database/migrations/008_ra3b_username';
import { up as up011 } from '../../src/database/migrations/011_ra3b_persona_id';
import { UserRepository } from '../../src/repositories/user.repository';

const repo = new UserRepository();

beforeAll(() => {
  up001();
  up007();
  up008();
  up011();
});

describe('UserRepository — DM toggles', () => {
  it('creates a row when none exists (no silent no-op)', () => {
    repo.setClanInviteDmEnabled('user1', true);
    expect(repo.findByDiscordId('user1')?.clanInviteDmEnabled).toBe(1);
  });

  it('toggles the tournament-match DM flag', () => {
    repo.setTournamentMatchDmEnabled('user1', false);
    expect(repo.findByDiscordId('user1')?.tournamentMatchDmEnabled).toBe(0);
  });
});

describe('UserRepository — language preference', () => {
  it('defaults to English for unknown users', () => {
    expect(repo.getLanguage('nobody')).toBe('en');
  });

  it('persists a supported language', () => {
    repo.setLanguage('user1', 'ru');
    expect(repo.getLanguage('user1')).toBe('ru');
  });
});

describe('UserRepository — RA3BattleNet persona link', () => {
  it('stores the persona id next to the name', () => {
    repo.linkRa3BattleNet('user1', 'Arcy', 138466);
    const user = repo.findByDiscordId('user1');
    expect(user?.ra3bUsername).toBe('Arcy');
    expect(user?.ra3bPersonaId).toBe(138466);
  });
});
