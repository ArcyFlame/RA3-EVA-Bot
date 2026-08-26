import {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { userRepository } from '../../repositories/user.repository';
import { Language } from '../../repositories/user.repository';
import { t } from '../../utils/i18n';
import { GameId, GAME_CONFIGS } from '../../config/games';

export function buildLinkManager(
  userId: string,
  lang: Language = 'en',
  game: GameId = 'ra3',
): {
  embeds: [EmbedBuilder];
  components: [ActionRowBuilder<StringSelectMenuBuilder>, ActionRowBuilder<ButtonBuilder>];
} {
  const user = userRepository.findByDiscordId(userId);
  const shatabrick = user?.shatabrickUsername ?? t(lang, 'link.notLinked');
  const ra3b = user?.ra3bUsername
    ? `${user.ra3bUsername}${user.ra3bPersonaId ? ` (ID ${user.ra3bPersonaId})` : ''}`
    : t(lang, 'link.notLinked');
  const embed = new EmbedBuilder()
    .setTitle(t(lang, 'link.title'))
    .setDescription(t(lang, 'link.description'))
    .setColor(GAME_CONFIGS[game].color)
    .setThumbnail(GAME_CONFIGS[game].artworkUrl)
    .addFields(
      { name: 'Shatabrick (C&C Online)', value: shatabrick, inline: false },
      { name: 'RA3BattleNet', value: ra3b, inline: false },
    );
  const select = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('link_platform')
      .setPlaceholder(t(lang, 'link.select'))
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('Shatabrick')
          .setDescription(t(lang, 'link.shatabrickHint'))
          .setValue('shatabrick'),
        new StringSelectMenuOptionBuilder()
          .setLabel('RA3BattleNet')
          .setDescription(t(lang, 'link.ra3bHint'))
          .setValue('ra3b'),
      ),
  );
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('link_remove_shatabrick')
      .setLabel(t(lang, 'link.removeShatabrick'))
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!user?.shatabrickUsername),
    new ButtonBuilder()
      .setCustomId('link_remove_ra3b')
      .setLabel(t(lang, 'link.removeRa3b'))
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!user?.ra3bUsername),
  );
  return { embeds: [embed], components: [select, buttons] };
}
