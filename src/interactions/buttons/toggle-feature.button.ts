import { ButtonInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { guildRepository } from '../../repositories/guild.repository';
import { denyUnlessAdmin } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';

export const customIdPrefix = 'toggle_feature_';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
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

  const feature = interaction.customId.replace('toggle_feature_', '');
  const guildData = guildRepository.findByDiscordId(interaction.guild.id);
  let current = false;
  switch (feature) {
    case 'clans':
      current = guildData?.clansEnabled === 1;
      break;
    case 'tournaments':
      current = guildData?.tournamentsEnabled === 1;
      break;
    case 'profiles':
      current = guildData?.profilesEnabled === 1;
      break;
    case 'twitchNotifier':
      current = guildData?.twitchNotifierEnabled === 1;
      break;
    case 'youtubeNotifier':
      current = guildData?.youtubeNotifierEnabled === 1;
      break;
    case 'moddbNotifier':
      current = guildData?.moddbNotifierEnabled === 1;
      break;
    case 'moderation':
      current = guildData?.moderationEnabled === 1;
      break;
    case 'lobby':
      current = guildData?.lobbyEnabled === 1;
      break;
    case 'statsAutoUpdate':
      current = guildData?.statsAutoUpdateEnabled === 1;
      break;
    case 'welcome':
      current = guildData?.welcomeEnabled === 1;
      break;
    case 'news':
      current = guildData?.newsEnabled === 1;
      break;
    case 'cncOnline':
      current = guildData?.cncOnlineEnabled === 1;
      break;
    case 'ra3BattleNet':
      current = guildData?.ra3BattleNetEnabled === 1;
      break;
    default:
      await interaction.reply({ content: 'Unknown feature.', ephemeral: true });
      return;
  }
  guildRepository.toggleFeature(interaction.guild.id, feature, !current);
  await interaction.reply({
    content: `✅ **${feature}** ${!current ? 'enabled' : 'disabled'}.`,
    ephemeral: true,
  });
}
