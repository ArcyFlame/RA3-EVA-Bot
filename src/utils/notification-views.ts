import {
  ButtonInteraction,
  StringSelectMenuInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { userRepository } from '../repositories/user.repository';
import { t, LANGUAGE_LABELS } from './i18n';

export async function showPersonalDmMenu(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
) {
  const user = userRepository.findByDiscordId(interaction.user.id);
  const matchDm = user?.tournamentMatchDmEnabled === 1;
  const clanDm = user?.clanInviteDmEnabled === 1;
  const lang = userRepository.getLanguage(interaction.user.id);

  const embed = new EmbedBuilder()
    .setTitle(t(lang, 'personal.title'))
    .setDescription(t(lang, 'personal.description'))
    .setColor(0x5865f2)
    .addFields(
      {
        name: t(lang, 'personal.matchDm'),
        value: matchDm ? t(lang, 'common.enabled') : t(lang, 'common.disabled'),
        inline: true,
      },
      {
        name: t(lang, 'personal.clanDm'),
        value: clanDm ? t(lang, 'common.enabled') : t(lang, 'common.disabled'),
        inline: true,
      },
      { name: t(lang, 'personal.language'), value: LANGUAGE_LABELS[lang], inline: true },
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('toggle_match_dm')
      .setLabel('Toggle Tournament Matches')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('toggle_clan_dm')
      .setLabel('Toggle Clan Invites')
      .setStyle(ButtonStyle.Secondary),
  );

  const languageRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('personal_language')
      .setPlaceholder(t(lang, 'personal.languageHint'))
      .addOptions(
        ...(Object.keys(LANGUAGE_LABELS) as Array<keyof typeof LANGUAGE_LABELS>).map((code) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(LANGUAGE_LABELS[code])
            .setValue(code)
            .setDefault(code === lang),
        ),
      ),
  );

  await interaction.editReply({ embeds: [embed], components: [row, languageRow] });
}
