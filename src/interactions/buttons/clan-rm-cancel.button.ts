import { ButtonInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';

/** Cancel button for the /clan_remove confirmation. */
export const customId = 'clan_rm_cancel';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  await interaction.update({ content: 'Clan removal cancelled.', embeds: [], components: [] });
}
