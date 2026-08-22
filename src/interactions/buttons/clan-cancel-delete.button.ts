import { ButtonInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';

export const customIdPrefix = 'clan_cancel_delete_';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  await interaction.reply({ content: 'Deletion cancelled.', ephemeral: true });
}
