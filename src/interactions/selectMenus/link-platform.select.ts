import {
  StringSelectMenuInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { userRepository } from '../../repositories/user.repository';
import { t } from '../../utils/i18n';

export const customId = 'link_platform';

export async function execute(_bot: RA3Bot, interaction: StringSelectMenuInteraction) {
  const lang = userRepository.getLanguage(interaction.user.id);
  const platform = interaction.values[0];
  if (platform !== 'shatabrick' && platform !== 'ra3b') {
    await interaction.reply({ content: t(lang, 'common.invalidPlatform'), ephemeral: true });
    return;
  }
  const isRa3b = platform === 'ra3b';
  const modal = new ModalBuilder()
    .setCustomId(`link_account_${platform}`)
    .setTitle(t(lang, isRa3b ? 'link.ra3bModal' : 'link.shatabrickModal'));
  const identifier = new TextInputBuilder()
    .setCustomId('identifier')
    .setLabel(t(lang, isRa3b ? 'link.ra3bIdentifier' : 'link.identifier'))
    .setPlaceholder(t(lang, isRa3b ? 'link.ra3bPlaceholder' : 'link.shatabrickPlaceholder'))
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(64)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(identifier));
  await interaction.showModal(modal);
}
