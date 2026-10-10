import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  LabelBuilder,
  FileUploadBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonInteraction,
  ModalSubmitInteraction,
  Message,
} from 'discord.js';
import { replayRatingRepository } from '../../repositories/replay-rating.repository';
import {
  replayRatingService,
  replayRatingEmbed,
  replayRatingControls,
} from '../../services/replay-rating.service';
import { activityRankService } from '../../services/activity-rank.service';
import { isModerator } from '../../utils/permissions';

const operations = new Set<number>();
export async function manageReplay(
  interaction: ButtonInteraction | ModalSubmitInteraction,
): Promise<void> {
  const match = /^replay_manage:(edit|remove|confirm|save):(\d+):(\d+)(?::(\d{17,20}))?$/.exec(
    interaction.customId,
  );
  const member = interaction.guild
    ? await interaction.guild.members
        .fetch({ user: interaction.user.id, force: true })
        .catch(() => null)
    : null;
  const card = match ? replayRatingRepository.get(Number(match[2])) : undefined;
  const action = match?.[1];
  if (
    !match ||
    !card ||
    card.closed ||
    !member ||
    card.guild_id !== interaction.guildId ||
    (card.revision ?? 0) !== Number(match[3]) ||
    (match[4] && match[4] !== interaction.user.id) ||
    (['edit', 'save'].includes(action!)
      ? card.user_id !== interaction.user.id
      : card.user_id !== interaction.user.id && !isModerator(member)) ||
    (['edit', 'remove'].includes(action!) && interaction.message?.id !== card.card_message_id)
  ) {
    await interaction.reply({
      content:
        'Only the uploader can edit this replay. The uploader or a moderator can remove its current card.',
      ephemeral: true,
    });
    return;
  }
  if (action === 'edit' && interaction.isButton()) {
    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(`replay_manage:save:${card.id}:${card.revision ?? 0}:${interaction.user.id}`)
        .setTitle('Edit Replay')
        .addLabelComponents(
          new LabelBuilder().setLabel('Description').setTextInputComponent(
            new TextInputBuilder()
              .setCustomId('description')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
              .setMaxLength(1500)
              .setValue(card.description || ''),
          ),
          new LabelBuilder()
            .setLabel('Replacement replay (optional)')
            .setDescription('Upload the correct .RA3Replay file. New files start fresh voting.')
            .setFileUploadComponent(
              new FileUploadBuilder().setCustomId('replacement').setRequired(false).setMaxValues(1),
            ),
        ),
    );
    return;
  }
  if (action === 'remove') {
    await interaction.reply({
      content:
        'Remove this replay and its vote card? This cannot be undone. Earned XP will not be awarded again for reposting the same file.',
      ephemeral: true,
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(
              `replay_manage:confirm:${card.id}:${card.revision ?? 0}:${interaction.user.id}`,
            )
            .setLabel('Remove Replay')
            .setStyle(ButtonStyle.Danger),
        ),
      ],
    });
    return;
  }
  if (operations.has(card.id)) {
    await interaction.reply({ content: 'This replay is already being updated.', ephemeral: true });
    return;
  }
  operations.add(card.id);
  await interaction.deferReply({ ephemeral: true });
  try {
    const channel = await interaction.guild!.channels.fetch(card.channel_id);
    if (!channel || !('messages' in channel)) throw new Error('The replay channel is unavailable.');
    const message = await channel.messages.fetch(card.card_message_id!).catch(() => null);
    if (!message || message.author.id !== interaction.client.user.id)
      throw new Error('The replay card is unavailable.');
    const current = replayRatingRepository.get(card.id);
    if (!current || current.closed || (current.revision ?? 0) !== (card.revision ?? 0))
      throw new Error('This replay has changed. Open the current card and try again.');
    if (action === 'confirm') {
      await message.delete();
      replayRatingRepository.closeMessage(message.id);
      await interaction.editReply({ content: 'Replay removed.', components: [] });
      return;
    }
    if (!interaction.isModalSubmit()) throw new Error('Open Edit Replay on the current card.');
    const description = interaction.fields.getTextInputValue('description').trim();
    const replacement = interaction.fields.getUploadedFiles('replacement')?.first();
    if (!replacement) {
      replayRatingRepository.editDescription(card.id, description, card.revision ?? 0);
      const updated = replayRatingRepository.get(card.id)!;
      await message.edit({
        embeds: [replayRatingEmbed(updated)],
        components: replayRatingControls(updated),
        allowedMentions: { parse: [] },
      });
    } else {
      if (!/\.ra3replay$/i.test(replacement.name ?? ''))
        throw new Error('Upload a .RA3Replay file.');
      const file = await activityRankService.downloadReplayFile(replacement);
      if (!file)
        throw new Error(
          'The replacement is not a valid replay, is too large, or could not be downloaded.',
        );
      if (replayRatingRepository.findFingerprint(card.guild_id, file.fingerprint))
        throw new Error(
          'This replay already has a card. Edit the description instead, or choose a different file.',
        );
      const source = {
        id: card.source_message_id,
        guild: interaction.guild,
        channelId: card.channel_id,
        channel,
        author: member.user,
        client: interaction.client,
        content: description,
      } as Message;
      const posted = await replayRatingService.post(source, replacement, file.fingerprint, file);
      if (!posted)
        throw new Error('The new replay could not be archived. The previous replay is unchanged.');
      await message.delete();
      replayRatingRepository.closeMessage(message.id);
    }
    await interaction.editReply({
      content:
        'Replay updated. A replacement file starts fresh voting and does not receive another upload XP award.',
      components: [],
    });
  } catch (error) {
    const text =
      error instanceof Error && !('request' in error) && !('rawError' in error)
        ? error.message
        : 'Discord could not complete the update. Check the card before trying again.';
    await interaction.editReply({ content: text.slice(0, 500), components: [] });
  } finally {
    operations.delete(card.id);
  }
}
