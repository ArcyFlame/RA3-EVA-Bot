import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { RA3Bot } from '../../bot';
import { tournamentScanner } from '../../services/tournament-scanner.service';
import { forumScanner } from '../../services/forum-scanner.service';
import { denyUnlessAdmin } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';

export const data = new SlashCommandBuilder()
  .setName('tournaments_scan')
  .setDescription('[Admin] Scan GameReplays (portal + forum) for tournaments now')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  const member = await resolveMember(interaction);
  const denial = denyUnlessAdmin(member);
  if (denial) {
    await interaction.reply({ content: denial, ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const count = await tournamentScanner.scan();
  const forum = await forumScanner.scan();
  const parts = [
    count > 0 ? `announced ${count} new tournament(s)` : 'no new portal tournaments',
    forum.results > 0 ? `linked ${forum.results} Challonge bracket(s)` : 'no new brackets',
    forum.registrations > 0
      ? `added ${forum.registrations} registration(s)`
      : 'no new registrations',
  ];
  await interaction.editReply({ content: `✅ ${parts.join(', ')}.` });
}
