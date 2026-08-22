import { ButtonInteraction, ChannelType, Guild, PermissionFlagsBits, OverwriteType } from 'discord.js';
import { RA3Bot } from '../../bot';
import { clanRepository } from '../../repositories/clan.repository';
import { denyUnlessAdmin } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';
import { parseCustomIdInt } from '../../utils/parse';
import { logger } from '../../utils/logger';

/**
 * Handles `approve_clan_{clanId}` (guild interactions, e.g. /clan_approve)
 * and `approve_clan_{clanId}_{guildId}` (approval DMs sent to admins when a
 * clan is created - the guild is resolved from the bot's client cache).
 */
export const customIdPrefix = 'approve_clan_';

export async function execute(bot: RA3Bot, interaction: ButtonInteraction) {
  const parts = interaction.customId.split('_'); // ['approve','clan',clanId,(guildId?)]
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

  // Admin check against the guild the clan belongs to.
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
  if (clan.approved) {
    await interaction.reply({ content: 'This clan is already approved.', ephemeral: true });
    return;
  }

  // Several slow Discord API calls follow — defer before the ack window closes.
  await interaction.deferReply({ ephemeral: true });
  try {
    const role = await guild.roles.create({
      name: `[${clan.tag}]`,
      color: clan.color || 0x5865f2,
      reason: `Clan approval for ${clan.name}`,
    });

    let category = guild.channels.cache.find(
      (c) => c.name === 'Clans' && c.type === ChannelType.GuildCategory,
    );
    if (!category) {
      category = await guild.channels.create({
        name: 'Clans',
        type: ChannelType.GuildCategory,
        reason: 'Clans category',
      });
    }

    const clanPermissions = [
      { id: role.id, type: OverwriteType.Role, allow: PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages | PermissionFlagsBits.Connect | PermissionFlagsBits.Speak },
      { id: guild.roles.everyone, type: OverwriteType.Role, deny: PermissionFlagsBits.ViewChannel | PermissionFlagsBits.Connect },
    ];

    const textChannel = await guild.channels.create({
      name: `clan-${clan.tag.toLowerCase()}`,
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: clanPermissions,
      reason: `Clan text channel for ${clan.name}`,
    });
    const voiceChannel = await guild.channels.create({
      name: `VC ${clan.tag}`,
      type: ChannelType.GuildVoice,
      parent: category.id,
      permissionOverwrites: clanPermissions,
      reason: `Clan voice channel for ${clan.name}`,
    });

    clanRepository.approveClan(clan.id, role.id, textChannel.id, voiceChannel.id);
    clanRepository.addMember(clan.id, clan.ownerId);

    const owner = await guild.members.fetch(clan.ownerId).catch(() => null);
    if (owner) await owner.roles.add(role).catch(() => null);

    await interaction.editReply({
      content: `Clan **${clan.name}** approved! Role and channels created.`,
    });
  } catch (error) {
    // A partial failure may leave orphaned role/channels; the `approved` guard
    // above keeps a retry from double-creating them (the DB row stays unapproved).
    logger.error(`approve_clan: failed to approve clan ${clanId}:`, error);
    await interaction.editReply({
      content:
        '❌ Failed to approve the clan. Some roles/channels may already exist - please check before retrying.',
    });
  }
}
