import { AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';
import { Command } from '../types';
import { CommandDefinition } from './command-registration';

export const COMMAND_PATHS: Readonly<Record<string, readonly string[]>> = {
  activity_admin: ['activity', 'admin'],
  add_master: ['master', 'add'],
  remove_master: ['master', 'remove'],
  list_masters: ['master', 'list'],
  bot_setup: ['bot', 'setup'],
  bot_profile: ['bot', 'profile'],
  clan_approve: ['clan', 'approve'],
  clan_manager: ['clan', 'manager'],
  clan_create: ['clan', 'create'],
  clan_join: ['clan', 'join'],
  clan_leave: ['clan', 'leave'],
  clan_manage: ['clan', 'manage'],
  clan_remove: ['clan', 'remove'],
  lobby_panel: ['panel', 'lobby'],
  match_panel: ['panel', 'matches'],
  stats_panel: ['panel', 'stats'],
  profile_admin: ['admin', 'profile'],
  tournaments_scan: ['tournament', 'scan'],
  tournament_link: ['tournament', 'link'],
  set_admin_role: ['set', 'admin', 'role'],
  test_channels: ['test', 'channels'],
  debug_notifiers: ['debug', 'notifiers'],
  clear_warnings: ['clear', 'warnings'],
  report_score: ['report', 'score'],
};

export function publicCommandName(internalName: string): string {
  return (COMMAND_PATHS[internalName] ?? [internalName]).join(' ');
}

export function resolveCommandName(
  interaction: ChatInputCommandInteraction | AutocompleteInteraction,
): string {
  const group = interaction.options.getSubcommandGroup?.(false);
  const sub = interaction.options.getSubcommand?.(false);
  const path = [interaction.commandName, group, sub].filter(Boolean);
  for (const [internalName, mapped] of Object.entries(COMMAND_PATHS)) {
    if (mapped.every((part, index) => path[index] === part)) return internalName;
  }
  // Renamed legacy definitions are never accepted as public commands.
  return interaction.commandName.includes('_') ? '' : interaction.commandName;
}

interface OptionDefinition {
  type: number;
  name: string;
  description?: string;
  options?: OptionDefinition[];
  [key: string]: unknown;
}

/** Internal handlers keep their keys; only the published Discord command tree changes. */
export function buildPublicCommands(commands: Iterable<Command>): CommandDefinition[] {
  const roots = new Map<string, CommandDefinition>();
  const all = [...commands];
  for (const command of all.filter((c) => !COMMAND_PATHS[c.data.name])) {
    if (command.data.name.includes('_')) throw new Error('Unmapped command: ' + command.data.name);
    roots.set(command.data.name, {
      ...(command.data.toJSON() as CommandDefinition),
      dm_permission: command.guildOnly === false,
    });
  }
  for (const command of all.filter((c) => COMMAND_PATHS[c.data.name])) {
    const definition = command.data.toJSON() as CommandDefinition & {
      description: string;
      options?: OptionDefinition[];
    };
    const [rootName, ...path] = COMMAND_PATHS[command.data.name];
    let root = roots.get(rootName);
    if (!root) {
      root = {
        name: rootName,
        description: rootName + ' commands',
        options: [],
        dm_permission: false,
        default_member_permissions: null,
      };
      roots.set(rootName, root);
    }
    // A public root may contain staff leaves. Each handler must authorize its own action.
    root.default_member_permissions = null;
    root.dm_permission = !!root.dm_permission || command.guildOnly === false;
    const options = (definition.options ?? []) as OptionDefinition[];
    const nested = options.some((o) => o.type === 1 || o.type === 2);
    if (nested && path.length !== 1) throw new Error('Command nesting is too deep');
    const leaf: OptionDefinition = {
      type: nested || path.length === 2 ? 2 : 1,
      name: path[0],
      description: definition.description,
      options:
        path.length === 2
          ? [{ type: 1, name: path[1], description: definition.description, options }]
          : options,
    };
    const rootOptions = (root.options ??= []) as OptionDefinition[];
    if (rootOptions.some((o) => o.type > 2 || o.name === leaf.name))
      throw new Error('Conflicting command path: ' + publicCommandName(command.data.name));
    rootOptions.push(leaf);
  }
  return [...roots.values()].sort((a, b) => a.name.localeCompare(b.name));
}
