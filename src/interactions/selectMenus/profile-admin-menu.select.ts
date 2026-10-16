import { UserSelectMenuInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { handleProfileAdminMenu } from '../../commands/admin/profile-admin-menu.view';
export const customIdPrefix = 'guide_profile:';
export async function execute(_bot: RA3Bot, interaction: UserSelectMenuInteraction) {
  await handleProfileAdminMenu(interaction);
}
