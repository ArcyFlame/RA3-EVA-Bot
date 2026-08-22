import { ModalSubmitInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { challongeService } from '../../services/challonge.service';
import { tournamentRepository } from '../../repositories/tournament.repository';
import { baseName } from '../../services/forum-scanner.service';
import { logger } from '../../utils/logger';

/** /tournament_link modal: parses any Challonge URL/ID form, validates, stores. */
export const customId = 'tournament_link_modal';

export async function execute(_bot: RA3Bot, interaction: ModalSubmitInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Server only.', ephemeral: true });
    return;
  }

  const raw = interaction.fields.getTextInputValue('bracket').trim();
  const ref = challongeService.parseTournamentRef(raw);
  if (!ref) {
    await interaction.reply({
      content:
        '❌ That does not look like a Challonge bracket. Paste the full URL (challonge.com/…) or the bracket ID.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  // Validate by fetching the tournament — catches typos and private brackets.
  let name: string | null = null;
  try {
    const tournament = await challongeService.getTournament(ref);
    name = tournament?.name ?? null;
  } catch (error) {
    logger.warn('tournament_link: validation fetch failed:', error);
    await interaction.editReply(
      '❌ Challonge did not return that tournament. Check the URL and that the bracket is public.',
    );
    return;
  }

  // Guild link (used by /matches fallback and match reminders).
  tournamentRepository.linkTournament(interaction.guild.id, ref, challongeService.bracketUrl(ref));

  // Attach to the newest event whose title matches, when provided/found.
  const wanted = interaction.fields.getTextInputValue('event_title').trim();
  let attachedTo: string | undefined;
  const events = tournamentRepository.getAnnouncements();
  const match = wanted
    ? events.find((e) => baseName(e.title).includes(baseName(wanted)))
    : events[events.length - 1];
  if (match) {
    tournamentRepository.setEventChallongeUrl(match.id, challongeService.bracketUrl(ref));
    attachedTo = match.title;
  }

  await interaction.editReply(
    `✅ Linked **${name || ref}**${attachedTo ? ` to **${attachedTo}**` : ''}. \`/matches\` and the Results button will use this bracket.`,
  );
}
