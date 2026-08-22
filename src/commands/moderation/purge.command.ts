import {
  ChatInputCommandInteraction,
  Message,
  PermissionFlagsBits,
  SlashCommandBuilder,
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

async function findMessages(
  channel: TextChannel,
  amount: number,
  userId?: string,
): Promise<{ messages: Message[]; scanned: number }> {
  const matches: Message[] = [];
  let before: string | undefined;
  let scanned = 0;

  while (matches.length < amount && scanned < 1000) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (batch.size === 0) break;
    scanned += batch.size;
    for (const message of batch.values()) {
      if ((!userId || message.author.id === userId) && message.deletable) {
        matches.push(message);
        if (matches.length === amount) break;
      }
    }
    before = batch.last()?.id;
    if (!before || batch.size < 100) break;
  }
  return { messages: matches, scanned };
}

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
  const found = await findMessages(channel, amount, user?.id);
  const recent = found.messages.filter((message) => message.bulkDeletable);
  const old = found.messages.filter((message) => !message.bulkDeletable);
  let deletedCount = 0;

  for (let offset = 0; offset < recent.length; offset += 100) {
    try {
      const deleted = await channel.bulkDelete(recent.slice(offset, offset + 100), true);
      deletedCount += deleted.size;
    } catch (error) {
      logger.warn('purge: bulk delete failed; falling back to individual deletes:', error);
      for (const message of recent.slice(offset, offset + 100)) {
        if (await message.delete().then(() => true).catch(() => false)) deletedCount++;
      }
    }
  }
  for (const message of old) {
    if (await message.delete().then(() => true).catch(() => false)) deletedCount++;
  }

  audit('purge', {
    moderator: interaction.user.id,
    guild: interaction.guild.id,
    channel: channel.id,
    requested: amount,
    deleted: deletedCount,
    scanned: found.scanned,
    filteredUser: user?.id,
  });
  const target = user ? ` from ${user.toString()}` : '';
  const shortfall = deletedCount < amount
    ? ` I found only ${deletedCount} deletable matching message(s) after checking ${found.scanned}.`
    : '';
  await interaction.editReply({ content: `✅ Deleted ${deletedCount} message(s)${target}.${shortfall}` });
}
