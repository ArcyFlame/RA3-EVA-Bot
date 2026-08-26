import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { RA3Bot } from '../../bot';
import { tournamentScanner } from '../../services/tournament-scanner.service';
import { forumScanner } from '../../services/forum-scanner.service';
import { denyUnlessAdmin } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';
import { getGameContext } from '../../utils/game-context';

export const data = new SlashCommandBuilder()
  .setName('tournaments_scan')
  .setDescription("[Admin] Scan this game's official sources for tournaments")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  const member = await resolveMember(interaction);
  const denial = denyUnlessAdmin(member);
  if (denial) {
    await interaction.reply({ content: denial, ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const context = getGameContext(interaction.guildId);
  const count = await tournamentScanner.scan(context.game);
  const forum = await forumScanner.scan(context.game);
  const parts = [
    count > 0 ? `found ${count} new tournament(s)` : 'no new tournament announcements',
  ];
  parts.push(
    forum.results > 0 ? `linked ${forum.results} Challonge bracket(s)` : 'no new brackets',
    forum.registrations > 0
      ? `added ${forum.registrations} registration(s)`
      : 'no new registrations',
  );
  await interaction.editReply({ content: `✅ ${parts.join(', ')}.` });
}
