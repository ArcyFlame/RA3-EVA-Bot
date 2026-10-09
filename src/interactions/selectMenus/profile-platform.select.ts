import { StringSelectMenuInteraction, EmbedBuilder } from 'discord.js';
import { RA3Bot } from '../../bot';
import { profileMenu, profileSessions } from '../../commands/profile/profile-menu';
import {
  buildDiscordProfileEmbed,
  buildPlayerProfileEmbed,
} from '../../commands/profile/profile.view';
import { guildRepository } from '../../repositories/guild.repository';
export const customIdPrefix = 'profile_platform:';
export async function execute(_bot: RA3Bot, interaction: StringSelectMenuInteraction) {
  const key = interaction.customId.slice(customIdPrefix.length);
  const session = profileSessions.get(key, interaction.user.id, interaction.guildId);
  const platform = interaction.values[0];
  const guild = interaction.guildId
    ? guildRepository.findByDiscordId(interaction.guildId)
    : undefined;
  if (
    !session ||
    !['cnc', 'ra3b'].includes(platform) ||
    guild?.profilesEnabled === 0 ||
    (guild && guild.game !== session.game) ||
    (session.game === 'genevo' && platform !== 'ra3b')
  ) {
    await interaction.reply({
      content: 'Open your own current profile with /profile.',
      ephemeral: true,
    });
    return;
  }
  await interaction.deferUpdate();
  const selected = platform as 'cnc' | 'ra3b';
  const embed =
    session.query && /^\d+$/.test(session.query) && selected !== session.initialPlatform
      ? new EmbedBuilder().setDescription(
          'Profile IDs are platform-specific. Run /profile with the correct player ID and platform for this account.',
        )
      : session.query
        ? await buildPlayerProfileEmbed(session.query, selected, session.lang, session.game)
        : await buildDiscordProfileEmbed(
            session.target!,
            session.lang,
            session.game,
            session.guildId,
            selected,
          );
  await interaction.editReply({
    embeds: [embed],
    components: profileMenu(key, session.game, selected),
    allowedMentions: { parse: [] },
  });
}
