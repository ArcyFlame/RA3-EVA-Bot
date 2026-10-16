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
  MessageFlags,
} from 'discord.js';
import { replayRatingRepository } from '../../repositories/replay-rating.repository';
import { replayRatingService, replayRatingPayload } from '../../services/replay-rating.service';
import { activityRankService } from '../../services/activity-rank.service';
import { isAdmin } from '../../utils/permissions';

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
    (card.user_id !== interaction.user.id && !isAdmin(member)) ||
    (['edit', 'remove'].includes(action!) &&
      interaction.message?.id !== card.card_message_id &&
      !(match[4] === interaction.user.id && interaction.message?.flags.has(MessageFlags.Ephemeral)))
  ) {
    await interaction.reply({
      content:
        'Only the uploader or server admins can edit or remove this replay. Open your private /replays menu.',
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
            .setDescription(
              'Every saved edit resets likes and dislikes, including description changes.',
            )
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
      try {
        await message.edit({ ...replayRatingPayload(updated), content: null });
      } catch {
        replayRatingService.refresh(message, card.id);
        await interaction.editReply({
          content:
            'Replay saved and votes reset. Discord could not refresh the card yet; a retry is scheduled. Previously earned XP is not awarded again.',
          components: [],
        });
        return;
      }
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
      const uploader = await interaction.guild!.members.fetch(card.user_id).catch(() => null);
      if (!uploader)
        throw new Error(
          'The original uploader is no longer in this server. The existing replay is unchanged.',
        );
      const source = {
        id: card.source_message_id,
        guild: interaction.guild,
        channelId: card.channel_id,
        channel,
        author: uploader.user,
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
        'Replay updated. Likes and dislikes start from zero. Previously earned XP is kept, but the same reward is not awarded again. Replacement files receive no extra upload XP.',
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
