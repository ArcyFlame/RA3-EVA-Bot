import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { guildRepository } from '../../repositories/guild.repository';
import { userRepository } from '../../repositories/user.repository';
import { buildLinkManager } from './link.view';
import { getGameContext } from '../../utils/game-context';

export const data = new SlashCommandBuilder()
  .setName('link')
  .setDescription('Manage your Shatabrick and RA3BattleNet accounts');

export const guildOnly = false;
export const dmAlwaysAllowed = true;

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  if (interaction.guildId) {
    const guildData = guildRepository.findByDiscordId(interaction.guildId);
    if (guildData?.profilesEnabled === 0) {
      await interaction.reply({
        content: '❌ Profiles are disabled on this server.',
        ephemeral: true,
      });
      return;
    }
  }
  userRepository.upsertFromMember(
    interaction.user.id,
    interaction.user.username,
    interaction.user.globalName ?? undefined,
    interaction.user.avatar ?? undefined,
  );
  const lang = userRepository.getLanguage(interaction.user.id);
  await interaction.reply({
    ...buildLinkManager(interaction.user.id, lang, getGameContext(interaction.guildId).game),
    ephemeral: true,
  });
}
