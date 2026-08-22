import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  CommandInteractionOption,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { buildCheckinBoard, findEventByOption } from './checkin.utils';

export const data = new SlashCommandBuilder()
  .setName('checkin')
  .setDescription('Tournament check-in board for referees')
  .addSubcommand((sub) =>
    sub
      .setName('start')
      .setDescription('Post the check-in board for an event (players press Check In)')
      .addStringOption((opt) =>
        opt.setName('event').setDescription('Event title (fuzzy)').setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('status')
      .setDescription('Show registered and checked-in players for an event')
      .addStringOption((opt) =>
        opt.setName('event').setDescription('Event title (fuzzy)').setRequired(true),
      ),
  );

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Server only.', ephemeral: true });
    return;
  }

  const sub = interaction.options.getSubcommand();
  const option: CommandInteractionOption<'cached'> | null =
    interaction.options.get('event', true) ?? null;
  const title = String(option?.value ?? '');

  const event = findEventByOption(title);
  if (!event) {
    await interaction.reply({
      content: 'No event matches that title. Check `/events` for exact names.',
      ephemeral: true,
    });
    return;
  }

  const board = buildCheckinBoard(event.id, interaction.guild.id);
  if (sub === 'status') {
    await interaction.reply({ ...board, ephemeral: true });
    return;
  }
  // start: post the board publicly so players can press the buttons.
  await interaction.reply(board);
}
