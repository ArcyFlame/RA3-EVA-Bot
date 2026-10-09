import { BaseRepository } from './base.repository';
import { activityRankRepository } from './activity-rank.repository';

export interface ReplayRatingCard {
  id: number;
  guild_id: string;
  user_id: string;
  channel_id: string;
  source_message_id: string;
  attachment_id: string;
  fingerprint: string;
  filename: string;
  card_message_id: string | null;
  bonus_awarded: number;
  rewarded_net_votes: number;
  closed: number;
}
export class ReplayRatingRepository extends BaseRepository {
  create(
    input: Omit<
      ReplayRatingCard,
      'id' | 'card_message_id' | 'bonus_awarded' | 'rewarded_net_votes' | 'closed'
    >,
  ): ReplayRatingCard {
    if (!/^[a-f0-9]{64}$/.test(input.fingerprint)) throw new Error('Invalid replay fingerprint.');
    this.run(
      `INSERT OR IGNORE INTO replay_rating_cards
      (guild_id, user_id, channel_id, source_message_id, attachment_id, fingerprint, filename)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.guild_id,
        input.user_id,
        input.channel_id,
        input.source_message_id,
        input.attachment_id,
        input.fingerprint,
        input.filename.slice(0, 200),
      ],
    );
    return this.findFingerprint(input.guild_id, input.fingerprint)!;
  }
  findFingerprint(guildId: string, fingerprint: string): ReplayRatingCard | undefined {
    return this.query<ReplayRatingCard>(
      'SELECT * FROM replay_rating_cards WHERE guild_id = ? AND fingerprint = ?',
      [guildId, fingerprint],
    );
  }
  findMessage(messageId: string): ReplayRatingCard | undefined {
    return this.query<ReplayRatingCard>(
      'SELECT * FROM replay_rating_cards WHERE card_message_id = ?',
      [messageId],
    );
  }
  get(id: number): ReplayRatingCard | undefined {
    return this.query<ReplayRatingCard>('SELECT * FROM replay_rating_cards WHERE id = ?', [id]);
  }
  attachMessage(id: number, messageId: string): void {
    this.run(
      'UPDATE replay_rating_cards SET card_message_id = ? WHERE id = ? AND card_message_id IS NULL',
      [messageId, id],
    );
  }
  closeMessage(messageId: string): void {
    this.run('UPDATE replay_rating_cards SET closed = 1 WHERE card_message_id = ?', [messageId]);
  }
  totals(id: number): { up: number; down: number } {
    return this.query<{ up: number; down: number }>(
      `SELECT COALESCE(SUM(vote = 1), 0) AS up,
      COALESCE(SUM(vote = -1), 0) AS down FROM replay_rating_votes WHERE card_id = ?`,
      [id],
    )!;
  }
  claimScan(guildId: string, now = Date.now()): boolean {
    return (
      this.run(
        `INSERT INTO replay_rating_scans (guild_id, last_scan_ms) VALUES (?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET last_scan_ms = excluded.last_scan_ms
      WHERE replay_rating_scans.last_scan_ms <= ?`,
        [guildId, now, now - 600000],
      ).changes === 1
    );
  }
  /** Consume each increase in net support once, even if the uploader's daily cap is full. */
  vote(
    id: number,
    voterId: string,
    vote: -1 | 1,
    remove = false,
    date = new Date().toISOString().slice(0, 10),
  ): number {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || ![-1, 1].includes(vote))
      throw new Error('Invalid vote.');
    return this.db.transaction(() => {
      const card = this.get(id);
      if (!card || card.closed || card.user_id === voterId) return 0;
      const settings = activityRankRepository.getSettings(card.guild_id);
      if (!settings.ratingsEnabled || !settings.replayEnabled) return 0;
      if (remove)
        this.run('DELETE FROM replay_rating_votes WHERE card_id = ? AND user_id = ? AND vote = ?', [
          id,
          voterId,
          vote,
        ]);
      else
        this.run(
          `INSERT INTO replay_rating_votes (card_id, user_id, vote) VALUES (?, ?, ?)
        ON CONFLICT(card_id, user_id) DO UPDATE SET vote = excluded.vote`,
          [id, voterId, vote],
        );
      const { up, down } = this.totals(id);
      const net = Math.max(0, up - down);
      // Removals can raise net support, but only a new positive vote earns XP.
      if (remove || vote !== 1 || net < settings.ratingMinVotes || net <= card.rewarded_net_votes)
        return 0;
      this.run(
        'INSERT OR IGNORE INTO replay_rating_daily (guild_id, user_id, award_date) VALUES (?, ?, ?)',
        [card.guild_id, card.user_id, date],
      );
      const daily = this.query<{ points: number }>(
        'SELECT points FROM replay_rating_daily WHERE guild_id = ? AND user_id = ? AND award_date = ?',
        [card.guild_id, card.user_id, date],
      )!;
      const points = Math.max(
        0,
        Math.min(
          (net - card.rewarded_net_votes) * settings.ratingPoints,
          settings.ratingReplayCap - card.bonus_awarded,
          settings.ratingDailyCap - daily.points,
        ),
      );
      this.run(
        'UPDATE replay_rating_cards SET rewarded_net_votes = ?, bonus_awarded = bonus_awarded + ? WHERE id = ?',
        [net, points, id],
      );
      this.run(
        'UPDATE replay_rating_daily SET points = points + ? WHERE guild_id = ? AND user_id = ? AND award_date = ?',
        [points, card.guild_id, card.user_id, date],
      );
      if (points) activityRankRepository.adjustPoints(card.guild_id, card.user_id, points);
      return points;
    })();
  }
  clearVotes(messageId: string, vote?: -1 | 1): void {
    const card = this.findMessage(messageId);
    if (!card) return;
    this.run(
      'DELETE FROM replay_rating_votes WHERE card_id = ?' + (vote ? ' AND vote = ?' : ''),
      vote ? [card.id, vote] : [card.id],
    );
  }
}
export const replayRatingRepository = new ReplayRatingRepository();
