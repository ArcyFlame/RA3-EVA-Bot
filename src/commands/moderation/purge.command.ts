import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  TextChannel,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { audit, logger } from '../../utils/logger';
import { denyUnlessModerator, moderationDisabled } from './utils';

export const data = new SlashCommandBuilder()
  .setName('purge')
  .setDescription('Delete messages')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addIntegerOption((option) =>
    option
      .setName('amount')
      .setDescription('Number of messages (1-100)')
      .setMinValue(1)
      .setMaxValue(100)
      .setRequired(true),
  )
  .addUserOption((option) =>
    option.setName('user').setDescription('Only delete from this user').setRequired(false),
  );

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  if (!interaction.guild || !(interaction.channel instanceof TextChannel)) {
    await interaction.reply({
      content: '❌ This command can only be used in a server text channel.',
      ephemeral: true,
    });
    return;
  }

  const featureDenial = moderationDisabled(interaction.guild);
  if (featureDenial) {
    await interaction.reply({ content: featureDenial, ephemeral: true });
    return;
  }

  const gate = await denyUnlessModerator(interaction);
  if ('error' in gate) {
    await interaction.reply({ content: gate.error, ephemeral: true });
    return;
  }

  const amount = interaction.options.getInteger('amount', true);
  const user = interaction.options.getUser('user');

  await interaction.deferReply({ ephemeral: true });

  const channel = interaction.channel;
  const messages = await channel.messages.fetch({ limit: Math.min(amount, 100) });
  const toDelete = user ? messages.filter((m) => m.author.id === user.id) : messages;
  // Discord rejects a bulk-delete batch containing system messages or messages
  // older than 14 days - `bulkDeletable` excludes exactly those.
  const deletable = toDelete.filter((m) => m.bulkDeletable);

  let deletedCount = 0;
  try {
    const deleted = await channel.bulkDelete(deletable, true);
    deletedCount = deleted.size;
  } catch (error) {
    // e.g. a message crossed the 14-day boundary between fetch and delete.
    logger.warn('purge: bulkDelete failed:', error);
  }

  audit('purge', {
    moderator: interaction.user.id,
    guild: interaction.guild.id,
    channel: channel.id,
    requested: amount,
    deleted: deletedCount,
    filteredUser: user?.id,
  });
  await interaction.editReply({ content: `✅ Deleted ${deletedCount} message(s).` });
}
