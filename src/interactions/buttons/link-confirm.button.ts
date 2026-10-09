import { ButtonInteraction, escapeMarkdown } from 'discord.js';
import { RA3Bot } from '../../bot';
import { pendingLinks } from '../../commands/profile/link-confirmation';
import { userRepository } from '../../repositories/user.repository';
import { guildRepository } from '../../repositories/guild.repository';
import { getGameContext } from '../../utils/game-context';
import { buildLinkManager } from '../../commands/profile/link.view';

export const customIdPrefix = 'link_confirm:';
export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  const [, action, key] = interaction.customId.split(':');
  const pending = pendingLinks.get(key, interaction.user.id, interaction.guildId);
  if (
    !pending ||
    !['save', 'cancel'].includes(action) ||
    getGameContext(interaction.guildId).game !== pending.game ||
    (interaction.guildId &&
      guildRepository.findByDiscordId(interaction.guildId)?.profilesEnabled === 0)
  ) {
    await interaction.reply({
      content: 'This confirmation expired or belongs to another person. Reopen /link.',
      ephemeral: true,
    });
    return;
  }
  pendingLinks.delete(key);
  if (action === 'save') {
    if (pending.platform === 'shatabrick')
      userRepository.linkShatabrick(interaction.user.id, pending.nickname);
    else userRepository.linkRa3BattleNet(interaction.user.id, pending.nickname, pending.profileId);
  }
  await interaction.update({
    content:
      action === 'save' ? `✅ Linked **${escapeMarkdown(pending.nickname)}**.` : 'Link cancelled.',
    ...buildLinkManager(interaction.user.id, pending.lang, pending.game),
    allowedMentions: { parse: [] },
  });
}
