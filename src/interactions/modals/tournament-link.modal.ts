import { ModalSubmitInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { challongeService } from '../../services/challonge.service';
import { tournamentRepository } from '../../repositories/tournament.repository';
import { editionsCompatible } from '../../services/forum-scanner.service';
import { findTournament, getCurrentTournament } from '../../services/tournament-context.service';
import { guildRepository } from '../../repositories/guild.repository';
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

  // Attach to the selected/current event only when the edition agrees with
  // Challonge's own name. This catches copied old links in forum posts too.
  const wanted = interaction.fields.getTextInputValue('event_title').trim();
  const game = guildRepository.findByDiscordId(interaction.guild.id)?.game ?? 'ra3';
  const match = wanted ? findTournament(wanted, game) : getCurrentTournament(game);
  if (wanted && !match) {
    await interaction.editReply(`❌ No stored tournament matches **${wanted}**.`);
    return;
  }
  if (match && name && !editionsCompatible(name, match.title)) {
    await interaction.editReply(
      `❌ Challonge calls this bracket **${name}**, which does not match **${match.title}**. Nothing was linked.`,
    );
    return;
  }

  // Guild link (used by /matches and match reminders).
  tournamentRepository.linkTournament(interaction.guild.id, ref, challongeService.bracketUrl(ref));

  let attachedTo: string | undefined;
  if (match) {
    tournamentRepository.setEventChallongeUrl(match.id, challongeService.bracketUrl(ref));
    tournamentRepository.addBracket(match.id, challongeService.bracketUrl(ref), name ?? undefined);
    attachedTo = match.title;
  }

  await interaction.editReply(
    `✅ Linked **${name || ref}**${attachedTo ? ` to **${attachedTo}**` : ''}. \`/matches\` and the Results button will use this bracket.`,
  );
}
