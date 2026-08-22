import { ModalSubmitInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { clanRepository } from '../../repositories/clan.repository';
import { parseCustomIdInt } from '../../utils/parse';

function parseHexColor(hex: string): number | null {
  const match = hex.match(/^#?([0-9A-Fa-f]{6})$/);
  if (!match) return null;
  return parseInt(match[1], 16);
}

export const customIdPrefix = 'clan_color_modal_';

export async function execute(_bot: RA3Bot, interaction: ModalSubmitInteraction) {
  if (!interaction.guild) return;
  const clanId = parseCustomIdInt(interaction.customId, 3);
  if (clanId === null) {
    await interaction.reply({ content: 'Invalid clan.', ephemeral: true });
    return;
  }
  const clan = clanRepository.findById(clanId);
  if (!clan || clan.ownerId !== interaction.user.id) {
    await interaction.reply({ content: 'Not authorized.', ephemeral: true });
    return;
  }
  const hex = interaction.fields.getTextInputValue('color');
  const colorInt = parseHexColor(hex);
  if (colorInt === null) {
    await interaction.reply({ content: 'Invalid HEX color. Use format #RRGGBB.', ephemeral: true });
    return;
  }

  clanRepository.updateColor(clanId, colorInt);
  await interaction.deferReply();
  const role = interaction.guild.roles.cache.get(clan.roleId ?? '');
  if (role) await role.edit({ color: colorInt }).catch(() => null);
  await interaction.editReply({ content: '✅ Role color updated.' });
}
