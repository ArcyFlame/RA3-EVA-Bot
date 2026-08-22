import { ButtonInteraction, Guild } from 'discord.js';
import { RA3Bot } from '../../bot';
import { clanRepository } from '../../repositories/clan.repository';
import { denyUnlessAdmin } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';
import { parseCustomIdInt } from '../../utils/parse';

/**
 * Handles `reject_clan_{clanId}` (guild interactions) and
 * `reject_clan_{clanId}_{guildId}` (approval DMs sent to admins).
 */
export const customIdPrefix = 'reject_clan_';

export async function execute(bot: RA3Bot, interaction: ButtonInteraction) {
  const parts = interaction.customId.split('_'); // ['reject','clan',clanId,(guildId?)]
  const clanId = parseCustomIdInt(interaction.customId, 2);
  if (clanId === null) {
    await interaction.reply({ content: 'Invalid clan.', ephemeral: true });
    return;
  }

  let guild: Guild | null = interaction.guild ?? null;
  if (!guild && parts[3]) {
    guild = await bot.client.guilds.fetch(parts[3]).catch(() => null);
  }
  if (!guild) {
    await interaction.reply({
      content: 'Could not resolve the server for this clan.',
      ephemeral: true,
    });
    return;
  }

  const member =
    interaction.guild && interaction.guild.id === guild.id
      ? await resolveMember(interaction)
      : await guild.members.fetch(interaction.user.id).catch(() => null);
  const denial = denyUnlessAdmin(member);
  if (denial) {
    await interaction.reply({ content: denial, ephemeral: true });
    return;
  }

  const clan = clanRepository.findById(clanId, guild.id);
  if (!clan) {
    await interaction.reply({ content: 'Clan not found.', ephemeral: true });
    return;
  }
  clanRepository.rejectClan(clan.id);
  await interaction.reply({ content: `Clan **${clan.name}** rejected.`, ephemeral: true });
}
