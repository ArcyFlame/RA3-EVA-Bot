import {
  ModalSubmitInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  escapeMarkdown,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { userRepository } from '../../repositories/user.repository';
import { ra3StatsService } from '../../services/ra3-stats.service';
import { pendingLinks, parseLinkIdentifier } from '../../commands/profile/link-confirmation';
import { t } from '../../utils/i18n';
import { getGameContext } from '../../utils/game-context';
import { shatabrickService } from '../../services/shatabrick.service';
import { guildRepository } from '../../repositories/guild.repository';

export const customIdPrefix = 'link_account_';

export async function execute(_bot: RA3Bot, interaction: ModalSubmitInteraction) {
  const lang = userRepository.getLanguage(interaction.user.id);
  const platform = interaction.customId.slice('link_account_'.length);
  const context = getGameContext(interaction.guildId);
  if (platform !== 'shatabrick' && platform !== 'ra3b') {
    await interaction.reply({ content: t(lang, 'common.invalidPlatform'), ephemeral: true });
    return;
  }
  if (
    (context.game === 'genevo' && platform === 'shatabrick') ||
    (interaction.guildId &&
      guildRepository.findByDiscordId(interaction.guildId)?.profilesEnabled === 0)
  ) {
    await interaction.reply({
      content: 'This profile platform is not enabled here.',
      ephemeral: true,
    });
    return;
  }
  const raw = interaction.fields.getTextInputValue('identifier').trim();
  const identifier = parseLinkIdentifier(raw, platform);
  if (!identifier) {
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
  let nickname: string;
  let profileId: number | undefined;
  if (platform === 'shatabrick') {
    const profile = await shatabrickService.resolve(identifier).catch(() => null);
    if (!profile) {
      await interaction.editReply(
        'No public Shatabrick profile was found for that nickname or ID.',
      );
      return;
    }
    nickname = profile.nickname;
    profileId = profile.profileId;
  } else if (/^\d{1,10}$/.test(identifier)) {
    const personaId = Number(identifier);
    const stats = await ra3StatsService.getRa3bPersonaStats(personaId).catch(() => null);
    if (!stats) {
      await interaction.editReply(t(lang, 'link.ra3bIdMissing'));
      return;
    }
    nickname = stats.personaName;
    profileId = personaId;
  } else {
    const personaId = await ra3StatsService.findRa3bPersonaId(identifier).catch(() => null);
    const stats = personaId
      ? await ra3StatsService.getRa3bPersonaStats(personaId).catch(() => null)
      : null;
    nickname = stats?.personaName ?? identifier;
    profileId = stats ? personaId! : undefined;
  }
  const session = pendingLinks.create({
    ownerId: interaction.user.id,
    guildId: interaction.guildId,
    game: context.game,
    lang,
    platform,
    nickname,
    profileId,
  });
  await interaction.editReply({
    content: `Link ${platform === 'shatabrick' ? 'Shatabrick' : 'RA3BattleNet'} as **${escapeMarkdown(nickname)}**${profileId ? ` (ID ${profileId})` : ' (nickname not found on the public ladder yet)'}?\nConfirm that this is your account.`,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`link_confirm:save:${session}`)
          .setLabel('Confirm account')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`link_confirm:cancel:${session}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
    allowedMentions: { parse: [] },
  });
}
