import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  EmbedBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import {
  REFRESH_TASKS,
  RefreshTask,
  refreshSettings,
  RefreshValidationError,
} from '../../repositories/refresh-settings.repository';
import { requireAdminInteraction } from '../../utils/admin-interaction';
import { isOwner } from '../../utils/permissions';
import { audit, logger } from '../../utils/logger';

export function refreshView(
  guild: string,
  user: string,
  owner: boolean,
  task: RefreshTask = 'lobby',
) {
  const settings = refreshSettings.read(guild, task),
    definition = REFRESH_TASKS[task];
  const id = (action: string) => `refresh:${action}:${guild}:${user}:${task}:${settings.revision}`;
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle('Automatic Refresh')
        .setColor(0x5865f2)
        .setDescription(
          `${definition.global ? '**Shared scanner - affects every server (bot owner only).**' : '**Panel timing for this server only.**'}\n\n${definition.label}: **${refreshSettings.minutes(guild, task)} minutes**\nAllowed: ${definition.min}-1440 minutes. Default: ${definition.minutes} minutes.\n\nChanges apply within the next scheduler checks without a restart. Disabled features stay disabled. Cached upstream data, service availability and posting limits still apply.${task === 'youtube' ? '\nYouTube uses this interval only in polling mode; webhook delivery is immediate.' : ''}${task === 'moddb' ? '\nModDB retains its separate six-hour posting limit.' : ''}`,
        ),
    ],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(id('select'))
          .setPlaceholder('Choose a panel or scanner')
          .addOptions(
            Object.entries(REFRESH_TASKS)
              .filter(([, entry]) => owner || !entry.global)
              .map(([key, entry]) => ({
                label: `${entry.label}${entry.global ? ' (all servers)' : ''}`,
                value: key,
                default: task === key,
              })),
          ),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(id('edit'))
          .setLabel('Change Interval')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(id('reset'))
          .setLabel('Restore Default')
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
    allowedMentions: { parse: [] as [] },
  };
}
export async function handleRefresh(
  interaction: ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction,
) {
  const match =
    /^refresh:(select|edit|save|reset):(\d{17,20}):(\d{17,20}):([a-z]+):(\d{1,12})$/.exec(
      interaction.customId,
    );
  if (!match || match[2] !== interaction.guildId || match[3] !== interaction.user.id) {
    await interaction.reply({ content: 'Open your own /bot refresh menu.', ephemeral: true });
    return;
  }
  if (!(await requireAdminInteraction(interaction))) return;
  const [, action, guild, user, rawTask, revision] = match;
  if (
    (action === 'select' && !interaction.isStringSelectMenu()) ||
    (action === 'save' && !interaction.isModalSubmit()) ||
    (['edit', 'reset'].includes(action) && !interaction.isButton())
  ) {
    await interaction.reply({ content: 'Use the refresh menu controls.', ephemeral: true });
    return;
  }
  const selected =
    action === 'select' && interaction.isStringSelectMenu() ? interaction.values[0] : rawTask;
  if (!Object.hasOwn(REFRESH_TASKS, selected)) {
    await interaction.reply({ content: 'Choose a valid refresh task.', ephemeral: true });
    return;
  }
  const task = selected as RefreshTask,
    owner = isOwner(user);
  if (REFRESH_TASKS[task].global && !owner) {
    await interaction.reply({
      content: 'Only the bot owner can change shared scanner intervals.',
      ephemeral: true,
    });
    return;
  }
  try {
    if (action === 'select' && interaction.isStringSelectMenu()) {
      await interaction.update(refreshView(guild, user, owner, task));
      return;
    }
    if (refreshSettings.read(guild, task).revision !== Number(revision))
      throw new RefreshValidationError('This menu is outdated. Reopen /bot refresh.');
    if (action === 'edit' && interaction.isButton()) {
      await interaction.showModal(
        new ModalBuilder()
          .setCustomId(`refresh:save:${guild}:${user}:${task}:${revision}`)
          .setTitle(REFRESH_TASKS[task].label + ' interval')
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId('minutes')
                .setLabel(`Minutes (${REFRESH_TASKS[task].min}-1440)`)
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(4)
                .setValue(String(refreshSettings.minutes(guild, task))),
            ),
          ),
      );
      return;
    }
    let minutes: number | null = null;
    if (action === 'save' && interaction.isModalSubmit()) {
      const value = interaction.fields.getTextInputValue('minutes').trim();
      if (!/^\d{1,4}$/.test(value))
        throw new RefreshValidationError('Enter a whole number of minutes.');
      minutes = Number(value);
    }
    refreshSettings.set(guild, task, Number(revision), minutes);
    audit('REFRESH_INTERVAL_UPDATE', { guildId: guild, userId: user, task, minutes });
    const view = refreshView(guild, user, owner, task);
    if (interaction.isModalSubmit()) await interaction.reply({ ...view, ephemeral: true });
    else await interaction.update(view);
  } catch (error) {
    logger.warn('Refresh menu failed', {
      task,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    const response = {
      content:
        error instanceof RefreshValidationError
          ? error.message
          : 'Unable to update refresh settings. Reopen /bot refresh.',
      ephemeral: true,
    };
    if (interaction.replied || interaction.deferred) await interaction.followUp(response);
    else await interaction.reply(response);
  }
}
