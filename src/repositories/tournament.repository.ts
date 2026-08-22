import { BaseRepository } from './base.repository';
import { normalizeTournamentWinnerNames } from '../utils/winner-names';

export interface TournamentEvent {
  id: number;
  eventUrl: string;
  title: string;
  description?: string;
  announcedAt: string;
  format?: string;
  prizePool?: string;
  maps?: string;
  startDate?: string;
  signUpUrl?: string;
  announcementChannelId?: string;
  announcementMessageId?: string;
  challongeUrl?: string;
  checkinsUrl?: string;
  registrationUrl?: string;
  topicUrl?: string;
  status?: 'unknown' | 'registration' | 'checkin' | 'in_progress' | 'ended';
}

/** A registered (and optionally checked-in) tournament participant. */
export interface TournamentParticipant {
  id: number;
  eventId: number;
  source: string;
  name: string;
  discordId?: string;
  checkedIn: number;
}

/** Input for recording a user-reported match result (pending referee review). */
export interface MatchReportInput {
  tournamentId: string;
  challongeMatchId: string;
  player1Id: string;
  player2Id: string;
  player1Score: number;
  player2Score: number;
  winnerId: string | null;
  reportedBy: string;
  proofUrl: string | null;
  eventId?: number;
  reporterParticipantId?: number;
  opponentParticipantId?: number;
  factionMatchup?: string;
}

export interface MatchReport {
  id: number;
  eventId?: number;
  tournamentId: string;
  challongeMatchId: string;
  player1Id: string;
  player2Id: string;
  player1Score: number;
  player2Score: number;
  winnerId: string | null;
  reportedBy: string;
  status: string;
  factionMatchup?: string;
  reporterName?: string;
  opponentName?: string;
}

export class TournamentRepository extends BaseRepository {
  // Events
  hasEventUrl(eventUrl: string): boolean {
    const row = this.query<{ id: number }>('SELECT id FROM tournament_events WHERE event_url = ?', [
      eventUrl,
    ]);
    return !!row;
  }

  /**
   * Refreshes the sign-up URL, description and extracted facts for a stored
   * event. `facts: null` means "the article was fetched but contains no
   * facts" (clears stale garbage); omitting `facts` keeps the old values
   * (article fetch failed).
   */
  updateEventDetails(
    eventUrl: string,
    signUpUrl: string | null,
    description: string | null,
    facts?: { format?: string; prizePool?: string; maps?: string } | null,
  ): void {
    if (facts === undefined) {
      this.run(
        'UPDATE tournament_events SET sign_up_url = ?, description = ? WHERE event_url = ?',
        [signUpUrl, description, eventUrl],
      );
      return;
    }
    this.run(
      `UPDATE tournament_events
       SET sign_up_url = ?, description = ?,
           format = ?, prize_pool = ?, maps = ?
       WHERE event_url = ?`,
      [
        signUpUrl,
        description,
        facts?.format ?? null,
        facts?.prizePool ?? null,
        facts?.maps ?? null,
        eventUrl,
      ],
    );
  }

  createEvent(data: Omit<TournamentEvent, 'id'>): number {
    const result = this.run(
      `INSERT INTO tournament_events (event_url, title, description, announced_at, format, prize_pool, maps, start_date, sign_up_url, announcement_channel_id, announcement_message_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.eventUrl,
        data.title,
        data.description,
        data.announcedAt,
        data.format,
        data.prizePool,
        data.maps,
        data.startDate,
        data.signUpUrl,
        data.announcementChannelId,
        data.announcementMessageId,
      ],
    );
    return result.lastInsertRowid;
  }

  /** Lightweight event list for the /events command (id + title only). */
  getEventSummaries(limit = 3): Array<{ id: number; title: string }> {
    return this.queryAll<{ id: number; title: string }>(
      'SELECT id, title FROM tournament_events ORDER BY announced_at DESC LIMIT ?',
      [limit],
    );
  }

  /** Full announcement list (with sign-up URL) for the interactive /events command. */
  getAnnouncements(): Array<{
    id: number;
    title: string;
    eventUrl: string;
    description: string | null;
    startDate: string | null;
    signUpUrl: string | null;
  }> {
    return this.queryAll<{
      id: number;
      title: string;
      event_url: string;
      description: string | null;
      start_date: string | null;
      sign_up_url: string | null;
    }>('SELECT id, title, event_url, description, start_date, sign_up_url FROM tournament_events ORDER BY id ASC').map(
      (r) => ({
        id: r.id,
        title: r.title,
        eventUrl: r.event_url,
        description: r.description,
        startDate: r.start_date,
        signUpUrl: r.sign_up_url,
      }),
    );
  }

  getLatestResultId(): number | undefined {
    const row = this.query<{ id: number }>(
      'SELECT id FROM tournament_results ORDER BY announced_at DESC LIMIT 1',
    );
    return row?.id;
  }

  /** Finds a stored result whose event URL matches the given announcement. */
  getResultIdByEventUrl(eventUrl: string): number | undefined {
    const row = this.query<{ id: number }>(
      'SELECT id FROM tournament_results WHERE event_url = ? ORDER BY announced_at DESC LIMIT 1',
      [eventUrl],
    );
    return row?.id;
  }

  getEventDetail(eventId: number) {
    const row = this.query<{
      title: string;
      event_url: string;
      description: string | null;
      format: string | null;
      prize_pool: string | null;
      maps: string | null;
      start_date: string | null;
      challonge_url: string | null;
      checkins_url: string | null;
      registration_url: string | null;
      topic_url: string | null;
      status: string | null;
    }>(
      'SELECT title, event_url, description, format, prize_pool, maps, start_date, challonge_url, checkins_url, registration_url, topic_url, status FROM tournament_events WHERE id = ?',
      [eventId],
    );
    if (!row) return undefined;
    return {
      title: row.title,
      eventUrl: row.event_url,
      description: row.description,
      format: row.format,
      prizePool: row.prize_pool,
      maps: row.maps,
      startDate: row.start_date,
      challongeUrl: row.challonge_url,
      checkinsUrl: row.checkins_url,
      registrationUrl: row.registration_url,
      topicUrl: row.topic_url,
      status: row.status ?? 'unknown',
    };
  }

  /** Newest event that has a discovered Challonge bracket (for /matches, /results). */
  getLatestEventWithChallonge(): { id: number; title: string; challongeUrl: string } | undefined {
    const row = this.query<{ id: number; title: string; challonge_url: string }>(
      'SELECT id, title, challonge_url FROM tournament_events WHERE challonge_url IS NOT NULL ORDER BY id DESC LIMIT 1',
    );
    return row ? { id: row.id, title: row.title, challongeUrl: row.challonge_url } : undefined;
  }

  /** Every event with a discovered bracket, newest first (callers filter by game). */
  getEventsWithChallonge(): Array<{ id: number; title: string; challongeUrl: string }> {
    return this.queryAll<{ id: number; title: string; challonge_url: string }>(
      'SELECT id, title, challonge_url FROM tournament_events WHERE challonge_url IS NOT NULL ORDER BY id DESC',
    ).map((r) => ({ id: r.id, title: r.title, challongeUrl: r.challonge_url }));
  }

  /** Caches a completed bracket's champion (feeds Tournament Wins Top 10). */
  recordWinner(
    tournamentUrl: string,
    winnerName: string,
    eventTitle?: string,
    game: 'ra3' | 'kw' | 'genevo' = 'ra3',
  ): void {
    const canonicalUrl = tournamentUrl.trim().toLowerCase();
    if (!canonicalUrl) return;
    const teamEvent = !!eventTitle && /\b[2-4]v(?:s)?[2-4]\b/i.test(eventTitle);
    for (const cleanName of normalizeTournamentWinnerNames(winnerName, teamEvent)) {
      const winnerKey = cleanName.toLocaleLowerCase('en-US');
      this.run(
        `INSERT OR IGNORE INTO tournament_winners
           (tournament_url, winner_name, winner_key, event_title, game)
         VALUES (?, ?, ?, ?, ?)`,
        [canonicalUrl, cleanName, winnerKey, eventTitle?.slice(0, 160) ?? null, game],
      );
    }
  }

  hasWinnerFor(tournamentUrl: string): boolean {
    return !!this.query<{ id: number }>('SELECT id FROM tournament_winners WHERE tournament_url = ?', [
      tournamentUrl.trim().toLowerCase(),
    ]);
  }

  setEventStatus(
    eventId: number,
    status: 'unknown' | 'registration' | 'checkin' | 'in_progress' | 'ended',
  ): void {
    this.run('UPDATE tournament_events SET status = ? WHERE id = ?', [status, eventId]);
  }

  getHistoricalScanState(): { nextOffset: number; completed: boolean } {
    const row = this.query<{ next_offset: number; completed_at: string | null }>(
      "SELECT next_offset, completed_at FROM tournament_scan_state WHERE scan_name = 'forum_history'",
    );
    return { nextOffset: row?.next_offset ?? 0, completed: !!row?.completed_at };
  }

  setHistoricalScanOffset(nextOffset: number, completed = false): void {
    this.run(
      `INSERT INTO tournament_scan_state (scan_name, next_offset, completed_at)
       VALUES ('forum_history', ?, CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END)
       ON CONFLICT(scan_name) DO UPDATE SET
         next_offset = excluded.next_offset,
         completed_at = excluded.completed_at`,
      [Math.max(0, nextOffset), completed ? 1 : 0],
    );
  }

  // ── Brackets (one event may run several Challonge brackets) ────────────

  /**
   * Registers a discovered bracket. A bracket named "playoff(s)/final/main"
   * becomes the primary one (its standings are the event's final results);
   * otherwise the first registered bracket stays primary.
   */
  addBracket(eventId: number, challongeUrl: string, bracketName?: string): boolean {
    const existing = this.query<{ id: number }>(
      'SELECT id FROM tournament_brackets WHERE challonge_url = ?',
      [challongeUrl],
    );
    if (existing) return false;
    const name = bracketName?.slice(0, 100) ?? null;
    const wantsPrimary = !!name && /playoff|final|main/i.test(name);
    if (wantsPrimary) {
      this.run('UPDATE tournament_brackets SET is_primary = 0 WHERE event_id = ?', [eventId]);
    }
    const anyPrimary = this.query<{ id: number }>(
      'SELECT id FROM tournament_brackets WHERE event_id = ? AND is_primary = 1',
      [eventId],
    );
    this.run(
      'INSERT INTO tournament_brackets (event_id, challonge_url, bracket_name, is_primary) VALUES (?, ?, ?, ?)',
      [eventId, challongeUrl, name, wantsPrimary || !anyPrimary ? 1 : 0],
    );
    return true;
  }

  getBrackets(eventId: number): Array<{ challongeUrl: string; bracketName: string | null; isPrimary: number }> {
    return this.queryAll<{
      challonge_url: string;
      bracket_name: string | null;
      is_primary: number;
    }>(
      'SELECT challonge_url, bracket_name, is_primary FROM tournament_brackets WHERE event_id = ? ORDER BY is_primary DESC, id ASC',
      [eventId],
    ).map((r) => ({
      challongeUrl: r.challonge_url,
      bracketName: r.bracket_name,
      isPrimary: r.is_primary,
    }));
  }

  /** Every discovered bracket across all events (for the winner sync pass). */
  getAllBrackets(): Array<{ eventId: number; eventTitle: string; challongeUrl: string }> {
    return this.queryAll<{ event_id: number; title: string; challonge_url: string }>(
      `SELECT b.event_id, e.title, b.challonge_url
       FROM tournament_brackets b
       JOIN tournament_events e ON e.id = b.event_id`,
    ).map((r) => ({ eventId: r.event_id, eventTitle: r.title, challongeUrl: r.challonge_url }));
  }

  /** Stores forum-discovered links (challonge/check-ins/registration) on an event. */
  updateEventLinks(
    eventId: number,
    links: { challongeUrl?: string; checkinsUrl?: string; registrationUrl?: string; topicUrl?: string },
  ): void {
    this.run(
      'UPDATE tournament_events SET challonge_url = COALESCE(?, challonge_url), checkins_url = COALESCE(?, checkins_url), registration_url = COALESCE(?, registration_url), topic_url = COALESCE(?, topic_url) WHERE id = ?',
      [
        links.challongeUrl ?? null,
        links.checkinsUrl ?? null,
        links.registrationUrl ?? null,
        links.topicUrl ?? null,
        eventId,
      ],
    );
  }

  setEventChallongeUrl(eventId: number, url: string): void {
    this.run('UPDATE tournament_events SET challonge_url = ? WHERE id = ?', [url, eventId]);
  }

  /** Single-field format setter (Challonge enrichment after facts refresh). */
  setEventFormat(eventId: number, format: string | null): void {
    this.run('UPDATE tournament_events SET format = ? WHERE id = ?', [format, eventId]);
  }

  /**
   * Overwrites extracted facts. Format and prize are written even when null
   * (an improved extractor must clear stale junk like "$2"/"ion"); the map
   * pool only improves (null keeps the old value — pool lists appear
   * inconsistently across article and topic pages).
   */
  updateEventFacts(
    eventId: number,
    facts: { format?: string; prizePool?: string; maps?: string },
  ): void {
    this.run(
      `UPDATE tournament_events
       SET format = ?,
           prize_pool = ?,
           maps = COALESCE(?, maps)
       WHERE id = ?`,
      [facts.format ?? null, facts.prizePool ?? null, facts.maps ?? null, eventId],
    );
  }

  // ── Participants (forum + Discord registrations, check-ins) ─────────────

  /**
   * Adds a participant unless the same normalized name already registered.
   * Names are stored trimmed; the UNIQUE(event_id, name) index dedupes with a
   * case-sensitive guard and this pre-check makes it case-insensitive.
   */
  addParticipant(eventId: number, name: string, source: string, discordId?: string): boolean {
    const clean = name.trim().slice(0, 50);
    if (!clean) return false;
    const existing = this.query<{ id: number }>(
      'SELECT id FROM tournament_participants WHERE event_id = ? AND lower(name) = lower(?)',
      [eventId, clean],
    );
    if (existing) return false;
    this.run(
      'INSERT OR IGNORE INTO tournament_participants (event_id, source, name, discord_id) VALUES (?, ?, ?, ?)',
      [eventId, source, clean, discordId ?? null],
    );
    return true;
  }

  getParticipants(eventId: number): TournamentParticipant[] {
    return this.queryAll<{
      id: number;
      event_id: number;
      source: string;
      name: string;
      discord_id: string | null;
      checked_in: number;
    }>(
      'SELECT id, event_id, source, name, discord_id, checked_in FROM tournament_participants WHERE event_id = ? ORDER BY id ASC',
      [eventId],
    ).map((r) => ({
      id: r.id,
      eventId: r.event_id,
      source: r.source,
      name: r.name,
      discordId: r.discord_id ?? undefined,
      checkedIn: r.checked_in,
    }));
  }

  getParticipantCount(eventId: number): number {
    const row = this.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM tournament_participants WHERE event_id = ?',
      [eventId],
    );
    return row?.count ?? 0;
  }

  /**
   * Participants that signed up through the forum thread (replies + roster).
   * Events whose registration ran elsewhere (private Google Docs) return 0
   * and fall back to the Challonge bracket count.
   */
  getForumParticipantCount(eventId: number): number {
    const row = this.query<{ count: number }>(
      "SELECT COUNT(*) as count FROM tournament_participants WHERE event_id = ? AND source != 'challonge'",
      [eventId],
    );
    return row?.count ?? 0;
  }

  /** Marks a participant checked in by normalized name; returns false if unknown. */
  setCheckedIn(eventId: number, name: string, checkedIn: boolean): boolean {
    const clean = name.trim().slice(0, 50);
    const result = this.run(
      `UPDATE tournament_participants
       SET checked_in = ?, checked_in_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE checked_in_at END
       WHERE event_id = ? AND lower(name) = lower(?)`,
      [checkedIn ? 1 : 0, checkedIn ? 1 : 0, eventId, clean],
    );
    return result.changes > 0;
  }

  setCheckedInByDiscord(eventId: number, discordId: string, checkedIn: boolean): boolean {
    const result = this.run(
      `UPDATE tournament_participants
       SET checked_in = ?, checked_in_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE checked_in_at END
       WHERE event_id = ? AND discord_id = ?`,
      [checkedIn ? 1 : 0, checkedIn ? 1 : 0, eventId, discordId],
    );
    return result.changes > 0;
  }

  linkParticipantDiscord(eventId: number, participantId: number, discordId: string): boolean {
    const result = this.run(
      `UPDATE tournament_participants
       SET discord_id = ?
       WHERE id = ? AND event_id = ? AND (discord_id IS NULL OR discord_id = ?)`,
      [discordId, participantId, eventId, discordId],
    );
    return result.changes > 0;
  }

  findParticipantByDiscord(eventId: number, discordId: string): TournamentParticipant | undefined {
    return this.getParticipants(eventId).find((participant) => participant.discordId === discordId);
  }

  getEventRegistrationIds(eventId: number, limit = 21): string[] {
    return this.queryAll<{ user_id: string }>(
      'SELECT user_id FROM tournament_registrations WHERE event_id = ? ORDER BY registered_at LIMIT ?',
      [eventId, limit],
    ).map((r) => r.user_id);
  }

  getEventRegistrationCount(eventId: number): number {
    const row = this.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM tournament_registrations WHERE event_id = ?',
      [eventId],
    );
    return row?.count ?? 0;
  }

  getResultDetail(resultId: number) {
    const row = this.query<{
      title: string;
      event_url: string;
      challonge_url: string | null;
      announced_at: string;
    }>(
      'SELECT title, event_url, challonge_url, announced_at FROM tournament_results WHERE id = ?',
      [resultId],
    );
    if (!row) return undefined;
    return {
      title: row.title,
      eventUrl: row.event_url,
      challongeUrl: row.challonge_url,
      announcedAt: row.announced_at,
    };
  }

  getResultVoteCounts(resultId: number): Array<{ vote: number; count: number }> {
    return this.queryAll<{ vote: number; count: number }>(
      'SELECT vote, COUNT(*) as count FROM tournament_votes WHERE result_id = ? AND vote IS NOT NULL GROUP BY vote',
      [resultId],
    );
  }

  registerForEvent(eventId: number, userId: string, guildId: string): void {
    this.run(
      `INSERT OR IGNORE INTO tournament_registrations (event_id, user_id, guild_id, registered_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
      [eventId, userId, guildId],
    );
  }

  unregisterFromEvent(eventId: number, userId: string): void {
    this.run('DELETE FROM tournament_registrations WHERE event_id = ? AND user_id = ?', [
      eventId,
      userId,
    ]);
  }

  getRegistrations(eventId: number): string[] {
    const rows = this.queryAll<{ user_id: string }>(
      'SELECT user_id FROM tournament_registrations WHERE event_id = ?',
      [eventId],
    );
    return rows.map((r) => r.user_id);
  }

  /** Returns the Challonge tournament id linked to a guild (from tournament_cache). */
  getLinkedTournamentId(guildId: string): string | undefined {
    const row = this.query<{ tournament_id: string }>(
      'SELECT tournament_id FROM tournament_cache WHERE guild_id = ?',
      [guildId],
    );
    return row?.tournament_id ?? undefined;
  }

  insertMatch(data: MatchReportInput): number {
    const result = this.run(
      `INSERT INTO tournament_matches
         (tournament_id, challonge_match_id, player1_id, player2_id, player1_score, player2_score,
          winner_id, reported_by, proof_url, event_id, reporter_participant_id,
          opponent_participant_id, faction_matchup)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.tournamentId,
        data.challongeMatchId,
        data.player1Id,
        data.player2Id,
        data.player1Score,
        data.player2Score,
        data.winnerId,
        data.reportedBy,
        data.proofUrl,
        data.eventId ?? null,
        data.reporterParticipantId ?? null,
        data.opponentParticipantId ?? null,
        data.factionMatchup ?? null,
      ],
    );
    return result.lastInsertRowid;
  }

  getMatchReport(reportId: number): MatchReport | undefined {
    const row = this.query<{
      id: number;
      event_id: number | null;
      tournament_id: string;
      challonge_match_id: string | null;
      player1_id: string;
      player2_id: string;
      player1_score: number;
      player2_score: number;
      winner_id: string | null;
      reported_by: string;
      status: string;
      faction_matchup: string | null;
      reporter_name: string | null;
      opponent_name: string | null;
    }>(
      `SELECT m.id, m.event_id, m.tournament_id, m.challonge_match_id,
              m.player1_id, m.player2_id, m.player1_score, m.player2_score,
              m.winner_id, m.reported_by, m.status, m.faction_matchup,
              reporter.name AS reporter_name, opponent.name AS opponent_name
       FROM tournament_matches m
       LEFT JOIN tournament_participants reporter ON reporter.id = m.reporter_participant_id
       LEFT JOIN tournament_participants opponent ON opponent.id = m.opponent_participant_id
       WHERE m.id = ?`,
      [reportId],
    );
    if (!row) return undefined;
    return {
      id: row.id,
      eventId: row.event_id ?? undefined,
      tournamentId: row.tournament_id,
      challongeMatchId: row.challonge_match_id ?? '',
      player1Id: row.player1_id,
      player2Id: row.player2_id,
      player1Score: row.player1_score,
      player2Score: row.player2_score,
      winnerId: row.winner_id,
      reportedBy: row.reported_by,
      status: row.status,
      factionMatchup: row.faction_matchup ?? undefined,
      reporterName: row.reporter_name ?? undefined,
      opponentName: row.opponent_name ?? undefined,
    };
  }

  reviewMatchReport(reportId: number, status: 'approved' | 'rejected', reviewedBy: string): boolean {
    const result = this.run(
      `UPDATE tournament_matches
       SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'pending'`,
      [status, reviewedBy, reportId],
    );
    return result.changes > 0;
  }

  getApprovedReports(eventId: number, limit = 10): MatchReport[] {
    return this.queryAll<{ id: number }>(
      `SELECT id FROM tournament_matches
       WHERE event_id = ? AND status = 'approved'
       ORDER BY reported_at DESC LIMIT ?`,
      [eventId, limit],
    )
      .map((row) => this.getMatchReport(row.id))
      .filter((row): row is MatchReport => !!row);
  }

  linkTournament(guildId: string, tournamentId: string, tournamentUrl: string): void {
    this.run(
      'INSERT OR REPLACE INTO tournament_cache (guild_id, tournament_id, tournament_url) VALUES (?, ?, ?)',
      [guildId, tournamentId, tournamentUrl],
    );
  }

  /** Marks the clicking user as confirmed (player1 or player2) for a match reminder. */
  confirmMatch(challongeMatchId: string, userId: string): void {
    this.run(
      `UPDATE tournament_match_confirmations
       SET player1_confirmed = CASE WHEN player1_id = ? THEN 1 ELSE player1_confirmed END,
           player2_confirmed = CASE WHEN player2_id = ? THEN 1 ELSE player2_confirmed END
       WHERE challonge_match_id = ?`,
      [userId, userId, challongeMatchId],
    );
  }

  /** Records a requested delay (minutes) for whichever player clicked, self-scoped. */
  recordDelay(challongeMatchId: string, userId: string, minutes: number): void {
    this.run(
      `UPDATE tournament_match_confirmations
       SET player1_delay = CASE WHEN player1_id = ? THEN ? ELSE player1_delay END,
           player2_delay = CASE WHEN player2_id = ? THEN ? ELSE player2_delay END
       WHERE challonge_match_id = ?`,
      [userId, minutes, userId, minutes, challongeMatchId],
    );
  }

  // ── Match reminders ────────────────────────────────────────────────────

  /** Every guild with a linked Challonge tournament (for the reminder poller). */
  getLinkedTournaments(): Array<{ guildId: string; tournamentId: string }> {
    const rows = this.queryAll<{ guild_id: string; tournament_id: string }>(
      'SELECT guild_id, tournament_id FROM tournament_cache WHERE tournament_id IS NOT NULL',
    );
    return rows.map((r) => ({ guildId: r.guild_id, tournamentId: r.tournament_id }));
  }

  getMatchReminder(
    guildId: string,
    tournamentId: string,
    challongeMatchId: string,
  ): { id: number; reminderSent: number } | undefined {
    const row = this.query<{ id: number; reminder_sent: number }>(
      `SELECT id, reminder_sent FROM tournament_match_confirmations
       WHERE guild_id = ? AND tournament_id = ? AND challonge_match_id = ?`,
      [guildId, tournamentId, challongeMatchId],
    );
    return row ? { id: row.id, reminderSent: row.reminder_sent } : undefined;
  }

  recordMatchReminder(
    guildId: string,
    tournamentId: string,
    challongeMatchId: string,
    player1Id: string,
    player2Id: string,
    scheduledTime: string | null,
  ): void {
    this.run(
      `INSERT INTO tournament_match_confirmations
         (guild_id, tournament_id, challonge_match_id, player1_id, player2_id, scheduled_time, reminder_sent)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [guildId, tournamentId, challongeMatchId, player1Id, player2Id, scheduledTime],
    );
  }

  markReminderSent(id: number): void {
    this.run('UPDATE tournament_match_confirmations SET reminder_sent = 1 WHERE id = ?', [id]);
  }
}

export const tournamentRepository = new TournamentRepository();
