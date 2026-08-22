import { Client, EmbedBuilder, escapeMarkdown } from 'discord.js';
import { guildRepository } from '../repositories/guild.repository';
import { tournamentRepository } from '../repositories/tournament.repository';
import { userRepository } from '../repositories/user.repository';
import { logger } from '../utils/logger';
import { resolveTournamentStatus } from '../utils/tournament-status';

export type CheckinActivity =
  | 'registered'
  | 'registered_and_checked_in'
  | 'checked_in'
  | 'cancelled';

const ACTIVITY_LABELS: Record<CheckinActivity, { title: string; description: string; color: number }> = {
  registered: {
    title: '📝 Tournament registration',
    description: 'New player registration:',
    color: 0x5865f2,
  },
  registered_and_checked_in: {
    title: '✅ Registration and check-in',
    description: 'A new player registered and checked in:',
    color: 0x57f287,
  },
  checked_in: {
    title: '✅ Player checked in',
    description: 'Ready to play:',
    color: 0x57f287,
  },
  cancelled: {
    title: '⏳ Check-in changed',
    description: 'No longer marked ready:',
    color: 0xfee75c,
  },
};

function titleMatchesGame(title: string, game: string): boolean {
  const genevo = /generals evolution|genevo|gen evo|zero hour/i;
  const kw = /kane'?s wrath|tiberi\w*|c&c ?3/i;
  if (game === 'genevo') return genevo.test(title);
  if (game === 'kw') return kw.test(title);
  return !genevo.test(title) && !kw.test(title);
}

export class CheckinNotificationService {
  private client: Client | null = null;

  setClient(client: Client): void {
    this.client = client;
  }

  async notify(eventId: number, activity: CheckinActivity, names: string[]): Promise<number> {
    const detail = tournamentRepository.getEventDetail(eventId);
    if (!this.client || !detail || names.length === 0) return 0;
    const status = resolveTournamentStatus({
      storedStatus: detail.status,
      startDate: detail.startDate,
      registrationUrl: detail.registrationUrl,
      checkinsUrl: detail.checkinsUrl,
    });
    if (status === 'ended') return 0;

    const copy = ACTIVITY_LABELS[activity];
    const embed = new EmbedBuilder()
      .setTitle(copy.title)
      .setColor(copy.color)
      .setDescription(
        `${copy.description}\n${names.map((name, index) => `${index + 1}. **${escapeMarkdown(name)}**`).join('\n')}`.slice(
          0,
          4000,
        ),
      )
      .addFields({ name: 'Tournament', value: detail.title.slice(0, 1024), inline: false })
      .setFooter({ text: 'Use the Referee DM Alerts button on /checkin to turn these off.' })
      .setTimestamp();

    let sent = 0;
    for (const config of guildRepository.getAllGuilds()) {
      if (
        config.tournamentsEnabled === 0 ||
        !config.refereeRoleId ||
        !titleMatchesGame(detail.title, config.game ?? 'ra3')
      ) {
        continue;
      }
      const guild = this.client.guilds.cache.get(config.discordId);
      if (!guild) continue;
      await guild.members.fetch().catch(() => null);
      const role = guild.roles.cache.get(config.refereeRoleId);
      if (!role) continue;
      for (const referee of role.members.values()) {
        if (referee.user.bot || !userRepository.isRefereeCheckinDmEnabled(referee.id)) continue;
        try {
          await referee.send({ embeds: [embed] });
          sent++;
        } catch (error) {
          logger.debug(`Check-in DM could not be sent to ${referee.id}:`, error);
        }
      }
    }
    return sent;
  }
}

export const checkinNotificationService = new CheckinNotificationService();
