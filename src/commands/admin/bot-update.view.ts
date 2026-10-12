import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle } from 'discord.js';
import { requestBotUpdate, UpdateReply } from '../../services/bot-update.service';
import { denyUnlessOwner } from '../../utils/permissions';
import { audit } from '../../utils/logger';

export function updateView(result: UpdateReply, guild: string, user: string) {
  let content: string;
  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  switch (result.status) {
    case 'available':
      content = `Installed: **v${result.installed}**\nAvailable: **v${result.version}**\n\nUpdate now? The bot will restart for all servers after checks pass.\nThis confirmation expires in 5 minutes.`;
      components.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`botupdate:yes:${guild}:${user}:${result.token}`)
            .setLabel('Yes, update now')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`botupdate:no:${guild}:${user}:${result.token}`)
            .setLabel('No')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setLabel('Release notes')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://github.com/ArcyFlame/RA3-EVA-Bot/releases/tag/${result.tag}`),
        ),
      );
      break;
    case 'current':
      content = `Installed: **v${result.installed}**. No newer eligible stable release is available.`;
      if (result.lastUpdateFailed)
        content += '\nThe last update failed its checks. See the host logs for details.';
      break;
    case 'accepted':
      content = `Update to **v${result.version}** accepted. Preparing the release and checking the database. The bot will restart when checks pass. Use /bot update to check the status.`;
      break;
    case 'cancelled':
      content = 'Manual update cancelled.';
      break;
    case 'busy':
      content =
        'An update check or installation is already in progress. Try /bot update again later.';
      break;
    case 'expired':
      content = 'This confirmation has expired or was replaced. Run /bot update again.';
      break;
    case 'unmanaged':
      content = 'Start the bot with npm start to use managed updates, then run /bot update again.';
      break;
    default:
      content = 'Unable to check or request the update. Try /bot update again later.';
  }
  return { content, components, allowedMentions: { parse: [] as never[] } };
}

export async function handleBotUpdate(interaction: ButtonInteraction) {
  const control = /^botupdate:(yes|no):(\d{17,20}):(\d{17,20}):([a-f0-9]{32})$/.exec(
    interaction.customId,
  );
  const denial = denyUnlessOwner(interaction.user.id);
  if (
    denial ||
    !control ||
    control[2] !== interaction.guildId ||
    control[3] !== interaction.user.id
  ) {
    await interaction.reply({
      content: denial ?? 'Open your own /bot update menu.',
      ephemeral: true,
    });
    return;
  }
  await interaction.deferUpdate();
  const result = await requestBotUpdate(control[1] === 'yes' ? 'confirm' : 'cancel', control[4]);
  if (result.status === 'accepted')
    audit('bot_update', {
      user: interaction.user.id,
      guild: interaction.guildId,
      version: result.version,
    });
  await interaction.editReply(updateView(result, interaction.guildId!, interaction.user.id));
}
