import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { userRepository } from '../../repositories/user.repository';
import { guildRepository } from '../../repositories/guild.repository';
import { ra3StatsService } from '../../services/ra3-stats.service';
import { sanitizeInput } from '../../utils/sanitize';

export const data = new SlashCommandBuilder()
  .setName('link_ra3battlenet')
  .setDescription('Link your Discord account to your RA3BattleNet persona')
  .addStringOption((option) =>
    option
      .setName('username')
      .setDescription('Your RA3BattleNet persona name or numeric persona id (from your profile URL)')
      .setRequired(true),
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

  const raw = interaction.options.getString('username', true).trim();
  const username = sanitizeInput(raw, 32);
  if (!username) {
    await interaction.reply({ content: '❌ Username is required.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  // RA3BattleNet is a separate account system from Shatabrick — this link is
  // stored independently so /profile queries the right ladder.
  userRepository.upsertFromMember(
    interaction.user.id,
    interaction.user.username,
    interaction.user.globalName ?? undefined,
    interaction.user.avatar ?? undefined,
  );

  // A numeric persona id (from the player's ra3battle.cn profile URL) works
  // even for players unranked in the current season.
  if (/^\d{1,10}$/.test(raw)) {
    const personaId = parseInt(raw, 10);
    const stats = await ra3StatsService.getRa3bPersonaStats(personaId).catch(() => null);
    if (!stats) {
      await interaction.editReply(
        `❌ No RA3BattleNet persona found for id \`${personaId}\`. Check the number in your profile URL.`,
      );
      return;
    }
    userRepository.linkRa3BattleNet(interaction.user.id, stats.personaName, personaId);
    await interaction.editReply(
      `✅ Linked to RA3BattleNet persona \`${stats.personaName}\` (id ${personaId}).`,
    );
    return;
  }

  // By name: resolve through the ladders so the profile can query exact stats.
  const personaId = await ra3StatsService.findRa3bPersonaId(username).catch(() => null);
  userRepository.linkRa3BattleNet(interaction.user.id, username, personaId ?? undefined);
  if (personaId) {
    await interaction.editReply(
      `✅ Linked to RA3BattleNet persona \`${username}\` (id ${personaId}).`,
    );
  } else {
    await interaction.editReply(
      `✅ Linked to RA3BattleNet persona \`${username}\`.\n` +
        `⚠️ You are not on this season's ladders, so live stats can't be found by name. ` +
        `Link with your numeric persona id instead: \`/link_ra3battlenet username: <id>\` (the number in your ra3battle.cn profile URL).`,
    );
  }
}
