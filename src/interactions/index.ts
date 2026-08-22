import { readdirSync } from 'fs';
import { join } from 'path';
import {
  AnySelectMenuInteraction,
  ButtonInteraction,
  Interaction,
  ModalSubmitInteraction,
} from 'discord.js';
import { RA3Bot } from '../bot';
import { logger } from '../utils/logger';
import { ComponentHandler, ComponentRegistry, registerComponent } from '../types';

/**
 * Loads every component module from buttons/, modals/ and selectMenus/.
 * Modules exporting `customId` register for exact matches; modules exporting
 * `customIdPrefix` register for prefix matches (dynamic ids like
 * `clan_kick_42`). Prefix handlers are matched longest-first so specific
 * prefixes win over generic ones.
 */
export async function registerComponents(bot: RA3Bot): Promise<void> {
  const extension = __filename.endsWith('.ts') ? '.ts' : '.js';

  const loadDir = <T extends Interaction>(dir: string, registry: ComponentRegistry<T>): void => {
    const fullPath = join(__dirname, dir);
    let files: string[] = [];
    try {
      files = readdirSync(fullPath).filter((f) => f.endsWith(extension));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error(`Failed to read component dir ${dir}:`, error);
      }
      return;
    }

    for (const file of files) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const handler = require(join(fullPath, file)) as Partial<ComponentHandler<T>>;
        if (
          typeof handler.execute !== 'function' ||
          (!handler.customId && !handler.customIdPrefix)
        ) {
          logger.warn(
            `Skipping component ${dir}/${file} - needs execute + customId/customIdPrefix`,
          );
          continue;
        }
        registerComponent(registry, handler as ComponentHandler<T>);
      } catch (error) {
        logger.error(`Failed to load component ${dir}/${file}:`, error);
      }
    }
  };

  loadDir<ButtonInteraction>('buttons', bot.components.buttons);
  loadDir<ModalSubmitInteraction>('modals', bot.components.modals);
  loadDir<AnySelectMenuInteraction>('selectMenus', bot.components.selectMenus);

  // Longest-prefix-first: `clan_edit_max_` must beat a hypothetical `clan_`.
  const registries = [bot.components.buttons, bot.components.modals, bot.components.selectMenus];
  for (const registry of registries) {
    registry.prefixed.sort(
      (a: { prefix: string }, b: { prefix: string }) => b.prefix.length - a.prefix.length,
    );
  }

  const count = (r: { exact: { size: number }; prefixed: { length: number } }) =>
    r.exact.size + r.prefixed.length;
  logger.info(
    `Registered components - buttons: ${count(bot.components.buttons)}, ` +
      `modals: ${count(bot.components.modals)}, select menus: ${count(bot.components.selectMenus)}`,
  );
}
