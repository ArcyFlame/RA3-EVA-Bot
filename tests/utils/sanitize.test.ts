import { describe, it, expect } from 'vitest';
import { sanitizeInput, validateClanTag, validateClanName } from '../../src/utils/sanitize';

describe('sanitizeInput', () => {
  it('neutralizes @everyone and @here', () => {
    expect(sanitizeInput('hi @everyone')).not.toContain('@everyone');
    expect(sanitizeInput('@here')).not.toContain('@here');
  });

  it('truncates to maxLength', () => {
    expect(sanitizeInput('x'.repeat(100), 10).length).toBeLessThanOrEqual(10);
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeInput('')).toBe('');
  });
});

describe('validateClanTag', () => {
  it('accepts 1–6 alphanumeric', () => {
    expect(validateClanTag('ABC123')).toBe(true);
    expect(validateClanTag('A')).toBe(true);
  });

  it('rejects too long or symbols', () => {
    expect(validateClanTag('ABCDEFG')).toBe(false);
    expect(validateClanTag('AB!')).toBe(false);
  });
});

describe('validateClanName', () => {
  it('accepts valid names', () => {
    expect(validateClanName('Red Alert')).toBe(true);
  });

  it('rejects too short or invalid characters', () => {
    expect(validateClanName('A')).toBe(false);
    expect(validateClanName('Bad@Name')).toBe(false);
  });
});
