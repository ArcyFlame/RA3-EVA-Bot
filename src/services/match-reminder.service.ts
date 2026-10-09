import {
  Client,
  GuildMember,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  escapeMarkdown,
} from 'discord.js';
import { logger } from '../utils/logger';
import { challongeService } from './challonge.service';
import { tournamentRepository } from '../repositories/tournament.repository';
import { guildRepository } from '../repositories/guild.repository';
import { userRepository } from '../repositories/user.repository';

const normalizeName = (name: string) => name.trim().normalize('NFKC').toLowerCase();

/** Name matching is guild-local and unambiguous, not proof of game-account ownership. */
export function memberMatchesParticipant(member: GuildMember, name: string): boolean {
  const needle = normalizeName(name);
  return (
    !member.user.bot &&
    !!needle &&
    [member.user.username, member.user.displayName, member.displayName].some(
      (alias) => !!alias && normalizeName(alias) === needle,
    )
  );
}

export function resolveReminderMember(
  members: Iterable<GuildMember>,
  name: string,
): GuildMember | null {
  const matching = [...members].filter((member) => memberMatchesParticipant(member, name));
  return matching.length === 1 ? matching[0] : null;
}

/** Sends at most one match-reminder attempt per DM-enabled participant in the linked server. */
export class MatchReminderService {
  private interval: NodeJS.Timeout | null = null;
  private polling = false;

  start(client: Client): void {
    if (this.interval) return;
    this.interval = setInterval(() => {
      this.checkMatches(client).catch((error) =>
        logger.error('Match reminder tick failed:', error),
      );
    }, 60 * 1000);
    this.interval.unref();
    logger.info('Match reminder service started');
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  private isLinkedAndEnabled(guildId: string, tournamentId: string): boolean {
    const cache = tournamentRepository.getResultCache(
      tournamentRepository.getLinkedTournamentUrl(guildId) ??
        challongeService.bracketUrl(tournamentId),
    );
    if (['complete', 'awaiting_review'].includes(String(cache?.tournament?.state))) return false;
    return (
      guildRepository.findByDiscordId(guildId)?.tournamentsEnabled === 1 &&
      tournamentRepository.getLinkedTournamentId(guildId) === tournamentId
    );
  }

  private async checkMatches(client: Client): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      for (const { guildId, tournamentId } of tournamentRepository.getLinkedTournaments()) {
        try {
          await this.checkGuild(client, guildId, tournamentId);
        } catch (error) {
          logger.error(`Match reminder failed for guild ${guildId}:`, error);
        }
      }
    } finally {
      this.polling = false;
    }
  }

  private async checkGuild(client: Client, guildId: string, tournamentId: string): Promise<void> {
    const guild = client.guilds.cache.get(guildId);
    if (!guild || !this.isLinkedAndEnabled(guildId, tournamentId)) return;
    const matches = await challongeService.getMatches(tournamentId);
    for (const match of matches) {
      if (match.state !== 'open')
        tournamentRepository.invalidateMatchReminder(guildId, tournamentId, String(match.id));
    }
    const upcoming = matches.filter((match) => {
      const time = Date.parse(match.scheduledTime ?? '');
      return match.state === 'open' && time >= Date.now() && time <= Date.now() + 10 * 60 * 1000;
    });
    if (!upcoming.length) return;
    const participants = await challongeService.getParticipants(tournamentId);
    // A partial cache cannot establish uniqueness. Failure to fetch the full guild skips this tick.
    const members = await guild.members.fetch().catch(() => null);
    if (!members || !this.isLinkedAndEnabled(guildId, tournamentId)) return;

    for (const match of upcoming) {
      const p1 = participants.find((participant) => participant.id === match.player1Id);
      const p2 = participants.find((participant) => participant.id === match.player2Id);
      if (!p1 || !p2) continue;
      const member1 = resolveReminderMember(members.values(), p1.name);
      const member2 = resolveReminderMember(members.values(), p2.name);
      if (!member1 || !member2 || member1.id === member2.id) continue;

      tournamentRepository.recordMatchReminder(
        guildId,
        tournamentId,
        String(match.id),
        member1.id,
        member2.id,
        match.scheduledTime ?? null,
        true,
      );
      const reminder = tournamentRepository.getMatchReminder(
        guildId,
        tournamentId,
        String(match.id),
      );
      if (
        !reminder ||
        !reminder.active ||
        reminder.reminderSent ||
        reminder.player1Id !== member1.id ||
        reminder.player2Id !== member2.id ||
        reminder.scheduledTime !== match.scheduledTime
      )
        continue;

      for (const [member, participant, opponent, notified] of [
        [member1, p1.name, p2.name, reminder.player1Notified],
        [member2, p2.name, p1.name, reminder.player2Notified],
      ] as const) {
        if (notified || !userRepository.isTournamentMatchDmEnabled(member.id)) continue;
        const current = await guild.members
          .fetch({ user: member.id, force: true })
          .catch(() => null);
        if (
          !current ||
          current.guild.id !== guildId ||
          !memberMatchesParticipant(current, participant) ||
          resolveReminderMember(guild.members.cache.values(), participant)?.id !== member.id ||
          !this.isLinkedAndEnabled(guildId, tournamentId) ||
          !userRepository.isTournamentMatchDmEnabled(member.id) ||
          Date.parse(match.scheduledTime ?? '') < Date.now()
        )
          continue;

        const embed = new EmbedBuilder()
          .setTitle('⏰ Match Reminder')
          .setDescription(
            `Your match against **${escapeMarkdown(opponent).slice(0, 200)}** starts within 10 minutes!`,
          )
          .setFooter({ text: guild.name })
          .setColor(0xffa500);
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`confirm_match_v1_${reminder.id}`)
            .setLabel('✅ Ready')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`delay_match_v1_${reminder.id}`)
            .setLabel('⏳ Need delay')
            .setStyle(ButtonStyle.Secondary),
        );
        if (!tournamentRepository.claimReminderDelivery(reminder.id, member.id)) continue;
        await current
          .send({ embeds: [embed], components: [row], allowedMentions: { parse: [] } })
          .catch((error) => logger.warn(`Match reminder: failed to DM ${member.id}:`, error));
      }
    }
  }
}

export const matchReminderService = new MatchReminderService();
