import { describe, it, expect } from 'vitest';
import { CooldownManager } from '../../src/utils/cooldown';

describe('CooldownManager', () => {
  it('allows first use and blocks within the window', () => {
    const cm = new CooldownManager();
    expect(cm.isOnCooldown('u1', 'cmd').onCooldown).toBe(false);
    cm.setCooldown('u1', 'cmd', 5);
    expect(cm.isOnCooldown('u1', 'cmd').onCooldown).toBe(true);
  });

  it('clearCooldown resets the window', () => {
    const cm = new CooldownManager();
    cm.setCooldown('u1', 'cmd', 5);
    cm.clearCooldown('u1', 'cmd');
    expect(cm.isOnCooldown('u1', 'cmd').onCooldown).toBe(false);
  });

  it('tracks cooldowns per command independently', () => {
    const cm = new CooldownManager();
    cm.setCooldown('u1', 'a', 5);
    expect(cm.isOnCooldown('u1', 'b').onCooldown).toBe(false);
  });
});
