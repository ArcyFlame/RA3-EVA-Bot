import { StringSelectMenuInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { userRepository, SUPPORTED_LANGUAGES, Language } from '../../repositories/user.repository';
import { showPersonalDmMenu } from '../../utils/notification-views';

/**
 * Language selector in Personal Settings: `personal_language`. Values are
 * validated against the supported set before persisting.
 */
export const customId = 'personal_language';

export async function execute(_bot: RA3Bot, interaction: StringSelectMenuInteraction) {
  const value = interaction.values[0];
  if (!(SUPPORTED_LANGUAGES as readonly string[]).includes(value)) {
    await interaction.reply({ content: 'Unsupported language.', ephemeral: true });
    return;
  }
  userRepository.setLanguage(interaction.user.id, value as Language);
  // Re-render the whole Personal Settings menu in the new language.
  await interaction.deferReply({ ephemeral: true });
  await showPersonalDmMenu(interaction);
}
