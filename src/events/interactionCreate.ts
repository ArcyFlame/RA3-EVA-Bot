import { Events, Interaction, RepliableInteraction } from 'discord.js';
import { RA3Bot } from '../bot';
import { logger } from '../utils/logger';
import { cooldownManager } from '../utils/cooldown';
import { handleInteractionError } from '../utils/interaction-error';
import { resolveComponent, ComponentRegistry } from '../types';
import { appSettingsRepository } from '../repositories/app-settings.repository';
import { guildRepository } from '../repositories/guild.repository';

export const name = Events.InteractionCreate;
export const once = false;

const DEFAULT_COMMAND_COOLDOWN_SECONDS = 3;
const COMPONENT_COOLDOWN_MS = 2_000;
const TOURNAMENT_COMMANDS = new Set([
  'events',
  'results',
  'matches',
  'pickmap',
  'checkin',
  'report_score',
  'tournament_link',
  'tournaments_scan',
  'match_panel',
]);
const RA3_ONLY_COMMANDS = new Set(['masters', 'add_master', 'remove_master', 'list_masters']);
const TOURNAMENT_COMPONENT_PREFIXES = [
  'eventpg_',
  'resultspg_',
  'checkin_',
  'score_review_',
  'confirm_match_',
  'delay_match_',
  'delay_modal_',
  'tournament_link_modal',
];

function tournamentToolsDisabled(guildId?: string | null): boolean {
  return !!guildId && guildRepository.findByDiscordId(guildId)?.tournamentsEnabled === 0;
}

function isTournamentComponent(customId: string): boolean {
  return TOURNAMENT_COMPONENT_PREFIXES.some((prefix) => customId.startsWith(prefix));
}

/**
 * customIds owned by message-component collectors living inside commands
 * (e.g. /toggle, /help). The router must not dispatch or cooldown these —
 * the collectors already filter by message id and user.
 */
const COLLECTOR_OWNED_PREFIXES: string[] = [];
const COLLECTOR_OWNED_IDS = new Set([
  'help_category',
  'select_match',
  'stats_mode',
  'helpcat_select',
]);

/**
 * Self-sweeping per-user component cooldowns. A single entry is kept per
 * user+customId and expired rows are dropped by an unref'd interval, so the
 * map stays bounded on long-running processes.
 */
const componentCooldowns = new Map<string, number>();
const cooldownSweep = setInterval(() => {
  const now = Date.now();
  for (const [key, expiry] of componentCooldowns) {
    if (now >= expiry) componentCooldowns.delete(key);
  }
}, 60_000);
cooldownSweep.unref();

function isComponentOnCooldown(userId: string, customId: string): boolean {
  const key = `${userId}:${customId}`;
  const expiry = componentCooldowns.get(key);
  if (expiry && Date.now() < expiry) return true;
  componentCooldowns.set(key, Date.now() + COMPONENT_COOLDOWN_MS);
  return false;
}

function isCollectorOwned(customId: string): boolean {
  return (
    COLLECTOR_OWNED_IDS.has(customId) ||
    COLLECTOR_OWNED_PREFIXES.some((p) => customId.startsWith(p))
  );
}

export async function execute(bot: RA3Bot, interaction: Interaction): Promise<void> {
  // ── Slash commands ─────────────────────────────────────────────────────
  if (interaction.isChatInputCommand()) {
    const command = bot.commands.get(interaction.commandName);
    if (!command) {
      logger.warn(`Unknown command: ${interaction.commandName}`);
      await interaction
        .reply({ content: '❌ Unknown command.', ephemeral: true })
        .catch((e) => logger.debug('Failed to answer unknown command:', e));
      return;
    }

    if (command.guildOnly !== false && !interaction.inGuild()) {
      await interaction
        .reply({ content: '❌ This command can only be used inside a server.', ephemeral: true })
        .catch((e) => logger.debug('Failed to answer DM command:', e));
      return;
    }
    if (
      !interaction.inGuild() &&
      command.guildOnly === false &&
      !command.dmAlwaysAllowed &&
      !appSettingsRepository.isDmPublicCommandsEnabled()
    ) {
      await interaction.reply({ content: 'Public commands in DMs are currently disabled.' });
      return;
    }
    if (
      RA3_ONLY_COMMANDS.has(interaction.commandName) &&
      interaction.guildId &&
      guildRepository.findByDiscordId(interaction.guildId)?.game === 'genevo'
    ) {
      await interaction.reply({
        content: 'The Masters Hall of Fame is a Red Alert 3 feature.',
        ephemeral: true,
      });
      return;
    }
    if (
      TOURNAMENT_COMMANDS.has(interaction.commandName) &&
      tournamentToolsDisabled(interaction.guildId)
    ) {
      await interaction.reply({
        content: 'Tournament and referee tools are disabled on this server.',
        ephemeral: true,
      });
      return;
    }

    const cooldownSeconds = command.cooldown ?? DEFAULT_COMMAND_COOLDOWN_SECONDS;
    const { onCooldown, remainingSeconds } = cooldownManager.isOnCooldown(
      interaction.user.id,
      interaction.commandName,
    );
    if (onCooldown) {
      await interaction
        .reply({
          content: `⏳ Please wait ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''} before using \`/${interaction.commandName}\` again.`,
          ephemeral: true,
        })
        .catch((e) => logger.debug('Failed to answer cooldown notice:', e));
      return;
    }
    cooldownManager.setCooldown(interaction.user.id, interaction.commandName, cooldownSeconds);

    try {
      await command.execute(bot, interaction);
    } catch (error) {
      await handleInteractionError(interaction, error, `Command /${interaction.commandName}`);
    }
    return;
  }

  // ── Autocomplete ───────────────────────────────────────────────────────
  if (interaction.isAutocomplete()) {
    if (
      TOURNAMENT_COMMANDS.has(interaction.commandName) &&
      tournamentToolsDisabled(interaction.guildId)
    ) {
      await interaction.respond([]);
      return;
    }
    const command = bot.commands.get(interaction.commandName);
    if (!command?.autocomplete) return;
    try {
      await command.autocomplete(bot, interaction);
    } catch (error) {
      logger.error(`Autocomplete for /${interaction.commandName} failed:`, error);
      await interaction.respond([]).catch((e) => logger.debug('Failed to answer autocomplete:', e));
    }
    return;
  }

  // ── Buttons ────────────────────────────────────────────────────────────
  if (interaction.isButton()) {
    if (isCollectorOwned(interaction.customId)) return;
    await dispatchComponent(bot, interaction, bot.components.buttons, 'button');
    return;
  }

  // ── Select menus (string, user, role, channel, mentionable) ───────────
  if (interaction.isAnySelectMenu()) {
    if (isCollectorOwned(interaction.customId)) return;
    await dispatchComponent(bot, interaction, bot.components.selectMenus, 'select menu');
    return;
  }

  // ── Modal submits ──────────────────────────────────────────────────────
  if (interaction.isModalSubmit()) {
    await dispatchComponent(bot, interaction, bot.components.modals, 'modal');
    return;
  }
}

async function dispatchComponent<T extends RepliableInteraction & { customId: string }>(
  bot: RA3Bot,
  interaction: T,
  registry: ComponentRegistry<T>,
  kind: string,
): Promise<void> {
  if (isTournamentComponent(interaction.customId) && tournamentToolsDisabled(interaction.guildId)) {
    await interaction
      .reply({
        content: 'Tournament and referee tools are disabled on this server.',
        ephemeral: true,
      })
      .catch(() => null);
    return;
  }
  if (isComponentOnCooldown(interaction.user.id, interaction.customId)) {
    await interaction
      .reply({ content: '⏳ Please slow down.', ephemeral: true })
      .catch((e) => logger.debug(`Failed to answer ${kind} cooldown:`, e));
    return;
  }

  const handler = resolveComponent(registry, interaction.customId);
  if (!handler) {
    logger.warn(`No ${kind} handler for customId: ${interaction.customId}`);
    await interaction
      .reply({ content: '❌ This component is no longer active.', ephemeral: true })
      .catch((e) => logger.debug(`Failed to answer unknown ${kind}:`, e));
    return;
  }

  try {
    await handler.execute(bot, interaction);
  } catch (error) {
    await handleInteractionError(interaction, error, `${kind} "${interaction.customId}"`);
  }
}
