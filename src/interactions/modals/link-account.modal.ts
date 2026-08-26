import { ModalSubmitInteraction } from 'discord.js';
import { RA3Bot } from '../../bot';
import { userRepository } from '../../repositories/user.repository';
import { ra3StatsService } from '../../services/ra3-stats.service';
import { sanitizeInput } from '../../utils/sanitize';
import { buildLinkManager } from '../../commands/profile/link.view';
import { t } from '../../utils/i18n';
import { getGameContext } from '../../utils/game-context';
import { shatabrickService } from '../../services/shatabrick.service';

export const customIdPrefix = 'link_account_';

export async function execute(_bot: RA3Bot, interaction: ModalSubmitInteraction) {
  const lang = userRepository.getLanguage(interaction.user.id);
  const platform = interaction.customId.slice('link_account_'.length);
  const context = getGameContext(interaction.guildId);
  if (platform !== 'shatabrick' && platform !== 'ra3b') {
    await interaction.reply({ content: t(lang, 'common.invalidPlatform'), ephemeral: true });
    return;
  }
  const raw = interaction.fields.getTextInputValue('identifier').trim();
  const identifier = sanitizeInput(raw, 64);
  if (!identifier || !/^[\p{L}\p{N}_.\- ]+$/u.test(identifier)) {
    await interaction.reply({ content: t(lang, 'common.invalidIdentifier'), ephemeral: true });
    return;
  }

  userRepository.upsertFromMember(
    interaction.user.id,
    interaction.user.username,
    interaction.user.globalName ?? undefined,
    interaction.user.avatar ?? undefined,
  );

  await interaction.deferReply({ ephemeral: true });
  let confirmation: string;
  if (platform === 'shatabrick') {
    const profile = await shatabrickService.resolve(identifier).catch(() => null);
    if (!profile) {
      await interaction.editReply(
        'No public Shatabrick profile was found for that nickname or ID.',
      );
      return;
    }
    userRepository.linkShatabrick(interaction.user.id, profile.nickname);
    confirmation = `✅ Shatabrick linked as \`${profile.nickname}\` (ID ${profile.profileId}).`;
  } else if (/^\d{1,10}$/.test(identifier)) {
    const personaId = Number(identifier);
    const stats = await ra3StatsService.getRa3bPersonaStats(personaId).catch(() => null);
    if (!stats) {
      await interaction.editReply(t(lang, 'link.ra3bIdMissing'));
      return;
    }
    userRepository.linkRa3BattleNet(interaction.user.id, stats.personaName, personaId);
    confirmation = `✅ RA3BattleNet linked as \`${stats.personaName}\` (ID ${personaId}).`;
  } else {
    const personaId = await ra3StatsService.findRa3bPersonaId(identifier).catch(() => null);
    userRepository.linkRa3BattleNet(interaction.user.id, identifier, personaId ?? undefined);
    confirmation = personaId
      ? `✅ RA3BattleNet linked as \`${identifier}\` (ID ${personaId}).`
      : `✅ RA3BattleNet: \`${identifier}\`. ${t(lang, 'link.savedNickname')}`;
  }
  await interaction.editReply({
    content: confirmation,
    ...buildLinkManager(interaction.user.id, lang, context.game),
  });
}
