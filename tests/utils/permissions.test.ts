import { describe, it, expect } from 'vitest';
import { isOwner, denyUnlessAdmin, denyUnlessOwner } from '../../src/utils/permissions';

describe('permissions', () => {
  it('isOwner matches the configured OWNER_ID', () => {
    expect(isOwner('123456789012345678')).toBe(true);
    expect(isOwner('999')).toBe(false);
  });

  it('denyUnlessOwner rejects non-owners', () => {
    expect(denyUnlessOwner('999')).toContain('restricted');
    expect(denyUnlessOwner('123456789012345678')).toBeNull();
  });

  it('denyUnlessAdmin rejects a null member (DM/uncached)', () => {
    expect(denyUnlessAdmin(null)).toContain('inside a server');
  });
});
