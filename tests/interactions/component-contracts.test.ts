import { describe, expect, it } from 'vitest';
import {
  createRegistry,
  registerComponent,
  resolveComponent,
  type ComponentHandler,
} from '../../src/types';

const modules = import.meta.glob('../../src/interactions/{buttons,modals,selectMenus}/*.ts', {
  eager: true,
}) as Record<string, ComponentHandler>;

describe('all registered Discord component contracts', () => {
  it('discovers the three component directories', () => {
    for (const directory of ['buttons', 'modals', 'selectMenus']) {
      expect(Object.keys(modules).some((path) => path.includes(`/${directory}/`))).toBe(true);
    }
  });

  it.each(Object.entries(modules))(
    '%s exports an executable, unambiguous route',
    (_path, handler) => {
      expect(typeof handler.execute).toBe('function');
      expect(Number(!!handler.customId) + Number(!!handler.customIdPrefix)).toBe(1);
      const route = handler.customId ?? handler.customIdPrefix;
      expect(typeof route).toBe('string');
      expect(route!.length).toBeGreaterThan(0);
      expect(route!.length).toBeLessThanOrEqual(100);
      const registry = createRegistry();
      registerComponent(registry, handler);
      expect(
        resolveComponent(registry, handler.customId ?? `${handler.customIdPrefix}fixture`),
      ).toBe(handler);
    },
  );

  it.each(['buttons', 'modals', 'selectMenus'])(
    '%s has no duplicate routes or shadowed handlers',
    (directory) => {
      const entries = Object.entries(modules).filter(([path]) => path.includes(`/${directory}/`));
      const seen = new Set<string>();
      const registry = createRegistry();
      for (const [path, handler] of entries) {
        const key = `${handler.customId ? 'exact' : 'prefix'}:${handler.customId ?? handler.customIdPrefix}`;
        expect(seen.has(key), `${path}: duplicate ${key}`).toBe(false);
        seen.add(key);
        registerComponent(registry, handler);
      }
      registry.prefixed.sort((a, b) => b.prefix.length - a.prefix.length);
      for (const [, handler] of entries) {
        expect(
          resolveComponent(registry, handler.customId ?? `${handler.customIdPrefix}fixture`),
        ).toBe(handler);
      }
      expect(resolveComponent(registry, 'unregistered_component_fixture')).toBeUndefined();
    },
  );
});
