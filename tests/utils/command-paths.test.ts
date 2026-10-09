import { describe, expect, it } from 'vitest';
import { ChatInputCommandInteraction } from 'discord.js';
import { Command } from '../../src/types';
import {
  buildPublicCommands,
  COMMAND_PATHS,
  resolveCommandName,
} from '../../src/utils/command-paths';
const modules = import.meta.glob('../../src/commands/**/*.command.ts', { eager: true }) as Record<
  string,
  Command
>;
const commands = Object.values(modules);
const publicCommands = buildPublicCommands(commands);
function interaction(root: string, group?: string, sub?: string) {
  return {
    commandName: root,
    options: { getSubcommandGroup: () => group ?? null, getSubcommand: () => sub ?? null },
  } as unknown as ChatInputCommandInteraction;
}
describe('public command paths', () => {
  it('publishes every handler exactly once without underscores or illegal nesting', () => {
    const routed: string[] = [];
    for (const root of publicCommands) {
      expect(root.name).toMatch(/^[a-z0-9-]+$/);
      const options = (root.options as any[]) ?? [];
      expect(options.length).toBeLessThanOrEqual(25);
      if (!options.some((o) => o.type <= 2))
        routed.push(resolveCommandName(interaction(root.name)));
      else
        for (const option of options) {
          expect(option.name).not.toContain('_');
          if (option.type === 1)
            routed.push(resolveCommandName(interaction(root.name, undefined, option.name)));
          else {
            expect(option.type).toBe(2);
            for (const sub of option.options) {
              expect(sub.type).toBe(1);
              routed.push(resolveCommandName(interaction(root.name, option.name, sub.name)));
            }
          }
        }
    }
    expect(new Set(routed)).toEqual(new Set(commands.map((c) => c.data.name)));
  });
  it.each(Object.entries(COMMAND_PATHS))(
    'routes %s without changing the original handler',
    (name, path) => {
      const command = commands.find((c) => c.data.name === name)!;
      const options = (command.data.toJSON() as any).options ?? [];
      const nested = options.filter((o: any) => o.type === 1);
      for (const sub of nested.length ? nested.map((o: any) => o.name) : [path.at(-1)]) {
        const group = nested.length ? path[1] : path.length === 3 ? path[1] : undefined;
        expect(resolveCommandName(interaction(path[0], group, sub))).toBe(name);
      }
    },
  );
  it('removes /activity rank and keeps activity public leaves distinct from admin', () => {
    const activity = publicCommands.find((c) => c.name === 'activity')!;
    expect((activity.options as any[]).map((o) => o.name)).toEqual([
      'leaderboard',
      'xp',
      'role',
      'admin',
    ]);
    expect(activity.default_member_permissions).toBeNull();
    expect(resolveCommandName(interaction('activity_admin'))).toBe('');
  });
});
