import { ModalSubmitInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { tournamentRepository } from '../../repositories/tournament.repository';
import { renderEventPage } from '../../commands/tournaments/events.utils';
import { resolveMember } from '../../utils/members';
import { isTournamentStaff } from '../../utils/permissions';
import { parseIntSafe } from '../../utils/parse';
import { parsePortalDate, TournamentStatus } from '../../utils/tournament-status';
import { guildRepository } from '../../repositories/guild.repository';

export const customIdPrefix = 'tournament_edit_modal_';

const STATUS_ALIASES: Record<string, TournamentStatus> = {
  unknown: 'unknown',
  registration: 'registration',
  open: 'registration',
  checkin: 'checkin',
  check_in: 'checkin',
  in_progress: 'in_progress',
  ongoing: 'in_progress',
  active: 'in_progress',
  ended: 'ended',
  finished: 'ended',
  complete: 'ended',
  completed: 'ended',
};

function optionalField(interaction: ModalSubmitInteraction, id: string): string | undefined {
  return interaction.fields.getTextInputValue(id).replace(/\s+/g, ' ').trim() || undefined;
}

export async function execute(_bot: RA3Bot, interaction: ModalSubmitInteraction) {
  const eventId = parseIntSafe(interaction.customId.slice(customIdPrefix.length));
  const member = await resolveMember(interaction);
  if (!eventId || !interaction.guildId || !member || !isTournamentStaff(member)) {
    await interaction.reply({ content: 'Tournament staff only.', ephemeral: true });
    return;
  }

  const detail = tournamentRepository.getEventDetail(eventId);
  const guildGame = guildRepository.findByDiscordId(interaction.guildId)?.game ?? 'ra3';
  if (!detail || detail.game !== guildGame) {
    await interaction.reply({
      content: 'This event is not available on this server.',
      ephemeral: true,
    });
    return;
  }

  const startDate = optionalField(interaction, 'date');
  if (startDate && parsePortalDate(startDate) === null && Number.isNaN(Date.parse(startDate))) {
    await interaction.reply({
      content: 'Use a recognizable date such as `14 Mar 2026, 14:00 GMT`.',
      ephemeral: true,
    });
    return;
  }

  const rawStatus = optionalField(interaction, 'status');
  const statusKey = rawStatus?.toLowerCase().replace(/[\s-]+/g, '_');
  const status = statusKey ? STATUS_ALIASES[statusKey] : undefined;
  if (rawStatus && !status) {
    await interaction.reply({
      content: 'Status must be registration, checkin, in progress, ended or unknown.',
      ephemeral: true,
    });
    return;
  }

  const prizePool = optionalField(interaction, 'prize');
  if (
    prizePool &&
    !((/\d/.test(prizePool) && /[$€£]|USD/i.test(prizePool)) || /^sponsored by/i.test(prizePool))
  ) {
    await interaction.reply({
      content: 'Prize must include a currency, for example `250$` or `250 USD`.',
      ephemeral: true,
    });
    return;
  }

  const format = optionalField(interaction, 'format');
  const mapsRaw = interaction.fields.getTextInputValue('maps').trim();
  const maps = mapsRaw
    ? mapsRaw
        .split(/\r?\n|;/)
        .map((value) => value.trim())
        .filter(Boolean)
        .join(', ')
        .slice(0, 1000)
    : undefined;
  if (!startDate && !status && !prizePool && !format && !maps) {
    await interaction.reply({ content: 'No tournament details were entered.', ephemeral: true });
    return;
  }

  tournamentRepository.updateManualMetadata(eventId, {
    startDate,
    status,
    prizePool,
    format,
    maps,
  });
  const rendered = renderEventPage(eventId, undefined, true);
  if (!rendered) {
    await interaction.reply({
      content: 'Saved, but the event could not be rendered.',
      ephemeral: true,
    });
    return;
  }
  const payload = { ...rendered, content: '✅ Tournament details saved.' };
  if (interaction.isFromMessage()) await interaction.update(payload);
  else await interaction.reply({ ...payload, ephemeral: true });
}
