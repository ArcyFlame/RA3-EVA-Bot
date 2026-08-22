import { BaseRepository } from './base.repository';

/** Records slash-command usage for analytics and audits. */
export class CommandUsageRepository extends BaseRepository {
  track(command: string, userId: string, guildId: string | null): void {
    // Discord command names are lowercase kebab/snake; anything else is not a
    // real command name, so refuse it before it reaches the database.
    if (!/^[a-z0-9_]{1,32}$/.test(command)) return;
    if (!/^\d{17,20}$/.test(userId)) return;
    if (guildId !== null && !/^\d{17,20}$/.test(guildId)) return;
    this.run('INSERT INTO command_usage (command, user_id, guild_id) VALUES (?, ?, ?)', [
      command,
      userId,
      guildId,
    ]);
  }

  topCommands(limit = 10): Array<{ command: string; uses: number }> {
    return this.queryAll<{ command: string; uses: number }>(
      'SELECT command, COUNT(*) as uses FROM command_usage GROUP BY command ORDER BY uses DESC LIMIT ?',
      [limit],
    );
  }
}

export const commandUsageRepository = new CommandUsageRepository();
