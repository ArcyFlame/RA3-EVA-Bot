import { ButtonInteraction, ActionRowBuilder, RoleSelectMenuBuilder } from 'discord.js';
import { RA3Bot } from '../../bot';

export const customId = 'setup_admin_role';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const select = new RoleSelectMenuBuilder()
    .setCustomId('setup_admin_role_select')
    .setPlaceholder('Select the admin role');
  const row = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(select);
  await interaction.editReply({
    content: 'Select the role that will be the admin role:',
    components: [row],
  });
}
