import { Client, ButtonInteraction, ModalSubmitInteraction } from 'discord.js';
import { MatchReminder, tournamentRepository } from '../repositories/tournament.repository';
import { guildRepository } from '../repositories/guild.repository';

/** Versioning prevents legacy provider match IDs from being mistaken for local row IDs. */
export function parseReminderControl(customId: string, prefix: string): number | null {
  if (!customId.startsWith(`${prefix}v1_`)) return null;
  const value = customId.slice(`${prefix}v1_`.length);
  if (!/^[1-9]\d{0,14}$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

export async function authorizeReminderControl(
  client: Client,
  interaction: ButtonInteraction | ModalSubmitInteraction,
  prefix: string,
): Promise<MatchReminder | null> {
  const id = parseReminderControl(interaction.customId, prefix);
  let reminder = id === null ? undefined : tournamentRepository.getMatchReminderById(id);
  const active = () => {
    reminder = id === null ? undefined : tournamentRepository.getMatchReminderById(id);
    if (!reminder?.active) return false;
    const cache = tournamentRepository.getResultCache(
      tournamentRepository.getLinkedTournamentUrl(reminder.guildId) ??
        `https://challonge.com/${reminder.tournamentId}`,
    );
    if (['complete', 'awaiting_review'].includes(String(cache?.tournament?.state))) return false;
    const time = Date.parse(reminder.scheduledTime ?? '');
    return (
      (interaction.user.id === reminder.player1Id || interaction.user.id === reminder.player2Id) &&
      (!interaction.guildId || interaction.guildId === reminder.guildId) &&
      time >= Date.now() - 30 * 60 * 1000 &&
      time <= Date.now() + 10 * 60 * 1000 &&
      guildRepository.findByDiscordId(reminder.guildId)?.tournamentsEnabled === 1 &&
      tournamentRepository.getLinkedTournamentId(reminder.guildId) === reminder.tournamentId
    );
  };
  if (active() && reminder) {
    const guild = client.guilds.cache.get(reminder.guildId);
    const member = await guild?.members
      .fetch({ user: interaction.user.id, force: true })
      .catch(() => null);
    if (
      member &&
      member.id === interaction.user.id &&
      !member.user.bot &&
      member.guild.id === reminder.guildId &&
      active()
    )
      return reminder;
  }
  const response = {
    content:
      'This reminder has expired or does not belong to you. Use the current tournament controls.',
    ephemeral: true,
    allowedMentions: { parse: [] as [] },
  };
  if (interaction.deferred || interaction.replied) await interaction.followUp(response);
  else await interaction.reply(response);
  return null;
}
