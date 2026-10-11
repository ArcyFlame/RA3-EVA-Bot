import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { RA3Bot } from '../../bot';
import { isOwner } from '../../utils/permissions';
import { tournamentRepository } from '../../repositories/tournament.repository';
import { tournamentAccessRepository } from '../../repositories/tournament-access.repository';

export const data = new SlashCommandBuilder()
  .setName('tournament_organizer')
  .setDescription('Assign the trusted organizer server (bot owner)')
  .addIntegerOption((o) =>
    o.setName('event').setDescription('Tournament event ID').setMinValue(1).setRequired(true),
  )
  .addStringOption((o) =>
    o.setName('server').setDescription('Organizer server ID; omit to revoke authorization'),
  );
export async function execute(bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  if (!isOwner(interaction.user.id)) {
    await interaction.reply({
      content: 'Only the bot owner can assign tournament organizers.',
      ephemeral: true,
    });
    return;
  }
  const eventId = interaction.options.getInteger('event', true);
  const guildId = interaction.options.getString('server')?.trim() || null;
  if (
    !tournamentRepository.getEventDetail(eventId) ||
    (guildId && (!/^\d{17,20}$/.test(guildId) || !bot.client.guilds.cache.has(guildId)))
  ) {
    await interaction.reply({
      content: 'Use an existing event ID and a server where this bot is installed.',
      ephemeral: true,
    });
    return;
  }
  tournamentAccessRepository.setOrganizer(eventId, guildId);
  await interaction.reply({
    content: guildId
      ? `Organizer server set to ${guildId} for event #${eventId}.`
      : `Organizer authorization removed for event #${eventId}.`,
    ephemeral: true,
  });
}
