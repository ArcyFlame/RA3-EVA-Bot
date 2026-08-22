import { ModalSubmitInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { trackedStreamerRepository } from '../../repositories/tracked-streamer.repository';
import { twitchService } from '../../services/twitch.service';
import { youTubeService } from '../../services/youtube.service';
import { denyUnlessAdmin } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';

export const customId = 'add_streamer_modal';

export async function execute(_bot: RA3Bot, interaction: ModalSubmitInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Server only.', ephemeral: true });
    return;
  }
  const member = await resolveMember(interaction);
  const denial = denyUnlessAdmin(member);
  if (denial) {
    await interaction.reply({ content: denial, ephemeral: true });
    return;
  }

  const platform = interaction.fields.getTextInputValue('platform').trim().toLowerCase();
  const identifier = interaction.fields.getTextInputValue('identifier').trim();
  if (platform !== 'twitch' && platform !== 'youtube') {
    await interaction.reply({
      content: 'Platform must be "twitch" or "youtube".',
      ephemeral: true,
    });
    return;
  }
  if (!identifier) {
    await interaction.reply({ content: 'Identifier is required.', ephemeral: true });
    return;
  }
  // YouTube channels are only resolvable by @handle; reject anything else rather
  // than storing an unresolvable identifier.
  if (platform === 'youtube' && !identifier.startsWith('@')) {
    await interaction.reply({
      content: 'YouTube channels must be entered as an @handle.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  let platformId: string;
  let displayName: string;
  if (platform === 'twitch') {
    const user = await twitchService.getUserByLogin(identifier);
    if (!user) {
      await interaction.editReply({ content: `Twitch user "${identifier}" not found.` });
      return;
    }
    platformId = user.id;
    displayName = user.displayName;
  } else {
    const channelId = await youTubeService.getChannelIdFromHandle(identifier);
    if (!channelId) {
      await interaction.editReply({ content: `YouTube channel "${identifier}" not found.` });
      return;
    }
    platformId = channelId;
    displayName = identifier;
  }

  trackedStreamerRepository.addStreamer(interaction.guild.id, platform, platformId, displayName);
  await interaction.editReply({ content: `✅ Now tracking **${displayName}** on ${platform}.` });
}
