import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { userRepository } from '../../repositories/user.repository';
import { guildRepository } from '../../repositories/guild.repository';
import { getGameContext } from '../../utils/game-context';
import { buildDiscordProfileEmbed, buildPlayerProfileEmbed, ProfilePlatform } from './profile.view';
import { profileMenu, profileSessions } from './profile-menu';
export { buildDiscordProfileEmbed } from './profile.view';
export const data = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('Privately view your linked platform statistics and activity rank')
  .addUserOption((o) => o.setName('user').setDescription('Discord user to view'))
  .addStringOption((o) =>
    o.setName('player').setDescription('Player nickname or platform-specific ID').setMaxLength(64),
  )
  .addStringOption((o) =>
    o
      .setName('platform')
      .setDescription('Statistics platform')
      .addChoices(
        { name: 'C&C Online - Shatabrick', value: 'cnc' },
        { name: 'RA3BattleNet', value: 'ra3b' },
      ),
  );
export const guildOnly = false;
export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  if (
    interaction.guildId &&
    guildRepository.findByDiscordId(interaction.guildId)?.profilesEnabled === 0
  ) {
    await interaction.reply({ content: 'Profiles are disabled on this server.', ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  const { game } = getGameContext(interaction.guildId);
  const lang = userRepository.getLanguage(interaction.user.id);
  const platform: ProfilePlatform =
    game === 'genevo' || interaction.options.getString('platform') === 'ra3b' ? 'ra3b' : 'cnc';
  const query = interaction.options.getString('player')?.trim();
  const target = query ? undefined : (interaction.options.getUser('user') ?? interaction.user);
  const embed = query
    ? await buildPlayerProfileEmbed(query, platform, lang, game)
    : await buildDiscordProfileEmbed(target!, lang, game, interaction.guildId, platform);
  const key = profileSessions.create({
    ownerId: interaction.user.id,
    guildId: interaction.guildId,
    target,
    query,
    game,
    lang,
    initialPlatform: platform,
  });
  await interaction.editReply({
    embeds: [embed],
    components: profileMenu(key, game, platform),
    allowedMentions: { parse: [] },
  });
}
