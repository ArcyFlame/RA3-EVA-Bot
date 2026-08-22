import { Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { logger } from '../utils/logger';
import { challongeService } from './challonge.service';
import { tournamentRepository } from '../repositories/tournament.repository';

/**
 * Polls linked Challonge tournaments and DMs participants ~10 minutes before
 * an upcoming match, with Ready / Need-delay buttons.
 *
 * Participant → Discord resolution is best-effort by name (there is no
 * Discord↔Challonge registration table), so a match whose players cannot be
 * matched to a cached Discord user is skipped and logged.
 */
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
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async checkMatches(client: Client): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const guilds = tournamentRepository.getLinkedTournaments();
      for (const { guildId, tournamentId } of guilds) {
        try {
          await this.checkGuild(client, guildId, tournamentId);
        } catch (error) {
          // One failing tournament must not abort the rest of the tick.
          logger.error(`Match reminder failed for guild ${guildId}:`, error);
        }
      }
    } finally {
      this.polling = false;
    }
  }

  private async checkGuild(client: Client, guildId: string, tournamentId: string): Promise<void> {
    const matches = await challongeService.getMatches(tournamentId);
    const upcoming = matches.filter(
      (m) => m.scheduledTime && new Date(m.scheduledTime) <= new Date(Date.now() + 10 * 60 * 1000),
    );

    for (const match of upcoming) {
      const existing = tournamentRepository.getMatchReminder(
        guildId,
        tournamentId,
        String(match.id),
      );
      if (existing?.reminderSent) continue;

      const participants = await challongeService.getParticipants(tournamentId);
      const p1 = participants.find((p) => p.id === match.player1Id);
      const p2 = participants.find((p) => p.id === match.player2Id);
      if (!p1 || !p2) continue;

      const user1 = this.resolveUser(client, p1.name);
      const user2 = this.resolveUser(client, p2.name);
      if (!user1 || !user2) {
        logger.debug(
          `Match reminder: could not resolve Discord users for match ${match.id} (${p1.name} / ${p2.name})`,
        );
        continue;
      }

      for (const [player, opponent] of [
        [user1, p2.name],
        [user2, p1.name],
      ] as const) {
        const embed = new EmbedBuilder()
          .setTitle('⏰ Match Reminder')
          .setDescription(`Your match against **${opponent}** starts in 10 minutes!`)
          .setColor(0xffa500);
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`confirm_match_${match.id}`)
            .setLabel('✅ Ready')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`delay_match_${match.id}`)
            .setLabel('⏳ Need delay')
            .setStyle(ButtonStyle.Secondary),
        );
        await player.send({ embeds: [embed], components: [row] }).catch((error) => {
          logger.warn(`Match reminder: failed to DM ${player.id}:`, error);
        });
      }

      if (existing) {
        tournamentRepository.markReminderSent(existing.id);
      } else {
        tournamentRepository.recordMatchReminder(
          guildId,
          tournamentId,
          String(match.id),
          user1.id,
          user2.id,
          match.scheduledTime ?? null,
        );
      }
    }
  }

  /** Best-effort Discord user resolution by Challonge participant name. */
  private resolveUser(client: Client, name: string) {
    const needle = name.toLowerCase();
    const matches = (user: { username: string; displayName?: string }) =>
      user.username.toLowerCase() === needle ||
      (user.displayName ?? user.username).toLowerCase() === needle;

    const cached = client.users.cache.find(matches);
    if (cached) return cached;

    // Fall back to cached guild members (the GuildMembers intent populates this
    // for active guilds), covering participants who never DM'd the bot.
    for (const guild of client.guilds.cache.values()) {
      const member = guild.members.cache.find((m) => matches(m.user));
      if (member) return member.user;
    }
    return null;
  }
}

export const matchReminderService = new MatchReminderService();
