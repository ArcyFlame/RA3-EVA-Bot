import { Interaction, RepliableInteraction } from 'discord.js';
import { logger } from './logger';

/** User-correctable problem — shown verbatim, logged at debug level. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}

const GENERIC_ERROR = '❌ An unexpected error occurred. The issue has been logged.';

/**
 * Centralized interaction failure handler.
 *
 * - UserError → the message is safe to show the user.
 * - anything else → generic message, full diagnostics logged (with redaction).
 *
 * Never throws: replying itself races with expiry/Unknown Interaction, so all
 * sends are caught and logged at debug level.
 */
export async function handleInteractionError(
  interaction: RepliableInteraction,
  error: unknown,
  context: string,
): Promise<void> {
  const isUserError = error instanceof UserError;
  const content = isUserError ? `❌ ${error.message}` : GENERIC_ERROR;

  if (isUserError) {
    logger.debug(`${context}: user error - ${error.message}`);
  } else {
    logger.error(
      `${context} failed (user ${interaction.user.id}, customId/command: ${interactionId(interaction)}):`,
      error,
    );
  }

  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content, ephemeral: true });
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
  } catch (replyError) {
    logger.debug(`${context}: could not deliver error message to user:`, replyError);
  }
}

function interactionId(interaction: Interaction): string {
  if (interaction.isCommand()) return interaction.commandName;
  if (interaction.isMessageComponent() || interaction.isModalSubmit()) return interaction.customId;
  return interaction.type.toString();
}

/**
 * Wraps an event/handler so a throw never becomes an unhandled rejection.
 * Used by the event loader where no interaction reply channel exists.
 */
export function wrapAsync<A extends unknown[]>(
  label: string,
  fn: (...args: A) => Promise<unknown>,
): (...args: A) => void {
  return (...args: A) => {
    fn(...args).catch((error) => logger.error(`${label} failed:`, error));
  };
}
