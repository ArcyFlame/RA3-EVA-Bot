import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { userRepository } from '../../repositories/user.repository';
import { guildRepository } from '../../repositories/guild.repository';
import { sanitizeInput } from '../../utils/sanitize';

export const data = new SlashCommandBuilder()
  .setName('link_shatabrick')
  .setDescription('Link your Discord account to Shatabrick')
  .addStringOption((option) =>
    option.setName('username').setDescription('Your Shatabrick username').setRequired(true),
  );

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Server only.', ephemeral: true });
    return;
  }

  const guildData = guildRepository.findByDiscordId(interaction.guild.id);
  if (guildData?.profilesEnabled === 0) {
    await interaction.reply({
      content: '❌ Profiles are disabled on this server.',
      ephemeral: true,
    });
    return;
  }

  const username = sanitizeInput(interaction.options.getString('username', true).trim(), 32);
  if (!username) {
    await interaction.reply({ content: '❌ Username is required.', ephemeral: true });
    return;
  }

  // Ensure a user row exists first — a bare UPDATE is a silent no-op for new users.
  userRepository.upsertFromMember(
    interaction.user.id,
    interaction.user.username,
    interaction.user.globalName ?? undefined,
    interaction.user.avatar ?? undefined,
  );
  userRepository.linkShatabrick(interaction.user.id, username);
  await interaction.reply({
    content: `✅ Linked to Shatabrick user \`${username}\`.`,
    ephemeral: true,
  });
}
