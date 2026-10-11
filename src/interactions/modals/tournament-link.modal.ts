import { ModalSubmitInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { challongeService } from '../../services/challonge.service';
import { tournamentRepository } from '../../repositories/tournament.repository';
import { editionsCompatible } from '../../services/forum-scanner.service';
import { findTournament, getCurrentTournament } from '../../services/tournament-context.service';
import { guildRepository } from '../../repositories/guild.repository';
import { logger } from '../../utils/logger';
import { statusFromChallonge } from '../../utils/tournament-status';
import { requireAdminInteraction } from '../../utils/admin-interaction';
import { requireTournamentAccess } from '../../utils/tournament-access';
import { isOwner } from '../../utils/permissions';
import { tournamentAccessRepository } from '../../repositories/tournament-access.repository';

/** /tournament_link modal: parses any Challonge URL/ID form, validates, stores. */
export const customId = 'tournament_link_modal';

export async function execute(_bot: RA3Bot, interaction: ModalSubmitInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Server only.', ephemeral: true });
    return;
  }

  if (!(await requireAdminInteraction(interaction))) return;
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

  // Validate against the provider before changing shared metadata.
  let name: string | null = null;
  let state: string | undefined;
  let tournamentId: string | undefined;
  try {
    const tournament = await challongeService.getTournament(ref);
    name = tournament?.name ?? null;
    state = tournament?.state;
    tournamentId = tournamentAccessRepository.rememberBracketIdentity(ref, tournament?.id);
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
  let match = wanted ? findTournament(wanted, game) : getCurrentTournament(game);
  if (match && name && !editionsCompatible(name, match.title)) {
    await interaction.editReply(
      `❌ Challonge calls this bracket **${name}**, which does not match **${match.title}**. Nothing was linked.`,
    );
    return;
  }

  // Guild link (used by /matches and match reminders).
  tournamentRepository.linkTournament(interaction.guild.id, ref, challongeService.bracketUrl(ref));

  let attachedTo: string | undefined;
  if (match && !(await requireTournamentAccess(interaction, match.id))) {
    await interaction.editReply(
      'The bracket is linked for this server. Shared tournament records were not changed; ask the bot owner to authorize an organizer.',
    );
    return;
  }
  if (!match) {
    if (!isOwner(interaction.user.id)) {
      await interaction.editReply(
        'The bracket is linked for this server. Only the bot owner can add it to the shared tournament catalog.',
      );
      return;
    }
    const title = wanted || name || `Tournament ${ref}`;
    const bracketUrl = challongeService.bracketUrl(ref);
    const eventId = tournamentRepository.createEvent({
      game,
      eventUrl: bracketUrl,
      title,
      description: `${title} tournament bracket and registration page.`,
      announcedAt: new Date().toISOString(),
      signUpUrl: bracketUrl,
    });
    tournamentRepository.setEventStatus(eventId, statusFromChallonge(state));
    tournamentAccessRepository.setOrganizer(eventId, interaction.guild.id);
    match = findTournament(title, game);
  }
  if (match) {
    if (isOwner(interaction.user.id) && !tournamentAccessRepository.organizer(match.id))
      tournamentAccessRepository.setOrganizer(match.id, interaction.guild.id);
    let otherAttachment = false,
      unresolved = false,
      lookups = 0;
    for (const bracket of tournamentRepository.getAllBrackets()) {
      if (bracket.eventId === match.id) continue;
      const previousRef = challongeService.parseTournamentRef(bracket.challongeUrl);
      if (!previousRef) continue;
      if (previousRef === ref) {
        otherAttachment = true;
        break;
      }
      let previousId = /^\d+$/.test(previousRef)
        ? previousRef
        : (tournamentAccessRepository.bracketIdentity(previousRef) ??
          tournamentRepository.getResultCache(bracket.challongeUrl)?.tournament?.id);
      if (!previousId && tournamentId) {
        if (lookups >= 5) {
          unresolved = true;
          continue;
        }
        lookups++;
        const previous = await challongeService.getTournament(previousRef).catch(() => null);
        previousId = tournamentAccessRepository.rememberBracketIdentity(previousRef, previous?.id);
      }
      if (previousId && tournamentId && String(previousId) === tournamentId) {
        otherAttachment = true;
        break;
      }
      if (!previousId) unresolved = true;
    }
    if (!(await requireTournamentAccess(interaction, match.id))) return;
    const ownerEvent = tournamentId
      ? tournamentAccessRepository.bracketOwner(tournamentId)
      : undefined;
    if (otherAttachment || (ownerEvent !== undefined && ownerEvent !== match.id)) {
      await interaction.editReply(
        'This bracket belongs to another event. Shared tournament details were not changed.',
      );
      return;
    }
    if (unresolved || !tournamentId) {
      await interaction.editReply(
        'Could not verify previous bracket identities. Shared details were not changed. Retry after the lookup limit resets; completed lookups are saved.',
      );
      return;
    }
    const url = challongeService.bracketUrl(ref);
    const existing = tournamentRepository.getBrackets(match.id).some((b) => b.challongeUrl === url);
    if (
      (!existing && !tournamentRepository.addBracket(match.id, url, name ?? undefined)) ||
      !tournamentRepository.setEventChallongeUrl(match.id, url)
    ) {
      await interaction.editReply(
        'This bracket could not be attached. Shared tournament details were not changed.',
      );
      return;
    }
    if (isOwner(interaction.user.id) && tournamentId)
      tournamentAccessRepository.authorizeBracket(
        match.id,
        tournamentId,
        interaction.guild.id,
        ref,
      );
    attachedTo = match.title;
  }

  await interaction.editReply(
    `✅ Linked **${name || ref}**${attachedTo ? ` to **${attachedTo}**` : ''}. \`/matches\` and the Results button will use this bracket.${!isOwner(interaction.user.id) ? ' Remote score sync requires the bot owner to confirm this bracket.' : ''}`,
  );
}
