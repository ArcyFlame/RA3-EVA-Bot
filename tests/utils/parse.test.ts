import { describe, it, expect } from 'vitest';
import { parseIntSafe, parseCustomIdInt } from '../../src/utils/parse';

describe('parseIntSafe', () => {
  it('parses positive integers', () => {
    expect(parseIntSafe('42')).toBe(42);
  });

  it('returns null for malformed input', () => {
    expect(parseIntSafe('abc')).toBeNull();
    expect(parseIntSafe('-1')).toBeNull();
    expect(parseIntSafe('')).toBeNull();
    expect(parseIntSafe(undefined)).toBeNull();
    expect(parseIntSafe(null)).toBeNull();
  });
});

describe('parseCustomIdInt', () => {
  it('parses a fragment', () => {
    expect(parseCustomIdInt('clan_kick_42', 2)).toBe(42);
  });

  it('returns null for a missing fragment', () => {
    expect(parseCustomIdInt('clan_kick', 2)).toBeNull();
  });
});
