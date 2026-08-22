import {
  Collection,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
  type ModalSubmitInteraction,
  type AnySelectMenuInteraction,
} from 'discord.js';
import type { RA3Bot } from './bot';

/** Minimal structural shape every slash-command definition must satisfy. */
export interface CommandData {
  name: string;
  toJSON(): unknown;
}

export interface Command {
  data: CommandData;
  execute: (bot: RA3Bot, interaction: ChatInputCommandInteraction) => Promise<void>;
  /** Optional autocomplete handler — wired up by the interaction router. */
  autocomplete?: (bot: RA3Bot, interaction: AutocompleteInteraction) => Promise<void>;
  /** Cooldown in seconds (router default applies when omitted). */
  cooldown?: number;
  /** When false the command may also run in DMs (default: true). */
  guildOnly?: boolean;
  /** Personal commands that remain available when public DM commands are disabled. */
  dmAlwaysAllowed?: boolean;
}

/**
 * A message-component or modal handler. Exactly one of `customId` (static
 * match) or `customIdPrefix` (dynamic suffix, e.g. `clan_kick_<clanId>`)
 * must be exported.
 */
export interface ComponentHandler<TInteraction extends Interaction = Interaction> {
  customId?: string;
  customIdPrefix?: string;
  execute: (bot: RA3Bot, interaction: TInteraction) => Promise<void>;
}

export interface ComponentRegistry<TInteraction extends Interaction> {
  exact: Collection<string, ComponentHandler<TInteraction>>;
  /** Evaluated in registration order; first matching prefix wins. */
  prefixed: Array<{ prefix: string; handler: ComponentHandler<TInteraction> }>;
}

export function createRegistry<
  TInteraction extends Interaction,
>(): ComponentRegistry<TInteraction> {
  return { exact: new Collection<string, ComponentHandler<TInteraction>>(), prefixed: [] };
}

export function resolveComponent<TInteraction extends Interaction>(
  registry: ComponentRegistry<TInteraction>,
  customId: string,
): ComponentHandler<TInteraction> | undefined {
  const exactMatch = registry.exact.get(customId);
  if (exactMatch) return exactMatch;
  for (const entry of registry.prefixed) {
    if (customId.startsWith(entry.prefix)) return entry.handler;
  }
  return undefined;
}

export function registerComponent<TInteraction extends Interaction>(
  registry: ComponentRegistry<TInteraction>,
  handler: ComponentHandler<TInteraction>,
): void {
  if (handler.customId) {
    registry.exact.set(handler.customId, handler);
  } else if (handler.customIdPrefix) {
    registry.prefixed.push({ prefix: handler.customIdPrefix, handler });
  } else {
    throw new Error('Component handler must export customId or customIdPrefix');
  }
}

export type ButtonHandler = ComponentHandler<ButtonInteraction>;
export type ModalHandler = ComponentHandler<ModalSubmitInteraction>;
export type SelectMenuHandler = ComponentHandler<AnySelectMenuInteraction>;

export interface ComponentRegistries {
  buttons: ComponentRegistry<ButtonInteraction>;
  modals: ComponentRegistry<ModalSubmitInteraction>;
  selectMenus: ComponentRegistry<AnySelectMenuInteraction>;
}
