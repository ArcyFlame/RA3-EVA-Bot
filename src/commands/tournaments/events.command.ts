import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { guildRepository } from '../../repositories/guild.repository';
import { getSortedAnnouncements, renderEventPage } from './events.utils';

export const data = new SlashCommandBuilder()
  .setName('events')
  .setDescription('Browse RA3 tournament announcements, sign-ups and results');

export const guildOnly = false;

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  const guildData = interaction.guildId
    ? guildRepository.findByDiscordId(interaction.guildId)
    : undefined;
  if (guildData?.tournamentsEnabled === 0) {
    await interaction.reply({
      content: '❌ Tournaments are disabled on this server.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const announcements = getSortedAnnouncements();
  if (announcements.length === 0) {
    await interaction.editReply({ content: 'No tournament announcements found.' });
    return;
  }

  // Single message with Prev/Next + Sign Up/Results buttons; navigation is
  // handled globally by the eventpg_* button handler.
  const rendered = renderEventPage(announcements[0].id, announcements);
  if (!rendered) {
    await interaction.editReply({ content: 'No tournament announcements found.' });
    return;
  }
  await interaction.editReply(rendered);
}
