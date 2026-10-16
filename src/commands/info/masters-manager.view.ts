import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  ModalBuilder,
  ModalSubmitInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { GameId } from '../../config/games';
import {
  masterRosterRepository,
  MasterValidationError,
  validateMaster,
} from '../../repositories/master-roster.repository';
import { buildMastersEmbed } from './masters.view';
import { isModerator } from '../../utils/permissions';
import { getGameContext } from '../../utils/game-context';
import { audit, logger } from '../../utils/logger';

const PAGE_SIZE = 10;
export function mastersView(
  guild: string | null,
  user: string,
  game: GameId,
  staff: boolean,
  page = 0,
  selected = 0,
) {
  const { entries, revision } = masterRosterRepository.snapshot(guild, game);
  const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  page = Math.max(0, Math.min(page, pages - 1));
  const visible = entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const target = visible.find((entry) => entry.id === selected) ?? visible[0];
  const id = (action: string, targetId = target?.id ?? 0, targetPage = page) =>
    `masters:${action}:${guild ?? 'dm'}:${user}:${game}:${targetId}:${revision}:${targetPage}`;
  const components: Array<
    ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>
  > = [];
  if (staff && guild) {
    if (visible.length)
      components.push(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(id('select'))
            .setPlaceholder('Choose an expert to edit or remove')
            .addOptions(
              visible.map((entry) => ({
                label: `${entry.name} (${entry.year})`.slice(0, 100),
                description: (entry.patch || 'No patch specified').slice(0, 100),
                value: String(entry.id),
                default: entry.id === target?.id,
              })),
            ),
        ),
      );
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(id('add', 0))
          .setLabel('Add Expert')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(id('edit'))
          .setLabel('Edit Expert')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(!target),
        new ButtonBuilder()
          .setCustomId(id('remove'))
          .setLabel('Remove Expert')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(!target),
      ),
    );
  }
  if (pages > 1)
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(id('page', 0, Math.max(0, page - 1)))
          .setLabel('Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId(id('page', 0, Math.min(pages - 1, page + 1)))
          .setLabel('Next')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === pages - 1),
      ),
    );
  const embed = buildMastersEmbed(visible, game).setFooter({
    text: `${entries.length} experts - Page ${page + 1}/${pages}`,
  });
  if (!entries.length) embed.setDescription('No experts in Hall of Fame yet.');
  return {
    content:
      staff && guild
        ? 'Manage this server’s Hall of Fame. Changes do not affect other servers.'
        : '',
    embeds: [embed],
    components,
    allowedMentions: { parse: [] as [] },
  };
}

type Interaction = ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction;
export async function handleMasters(interaction: Interaction) {
  const match =
    /^masters:(manage|page|select|add|edit|save|remove|confirm|cancel):(\d{17,20}|dm):(\d{17,20}):(ra3|genevo):(\d{1,9}):([a-f0-9]{12}):(\d{1,3})$/.exec(
      interaction.customId,
    );
  const reply = (content: string) =>
    interaction.reply({ content, ephemeral: true, allowedMentions: { parse: [] as [] } });
  if (!match || match[2] !== (interaction.guildId ?? 'dm') || match[3] !== interaction.user.id) {
    await reply('Open your own /experts menu.');
    return;
  }
  const [, action, rawGuild, user, rawGame, rawId, revision, rawPage] = match;
  const guild = rawGuild === 'dm' ? null : rawGuild;
  const game = rawGame as GameId,
    id = Number(rawId),
    page = Number(rawPage);
  const member = interaction.guild
    ? await interaction.guild.members.fetch({ user, force: true }).catch(() => null)
    : null;
  const staff = !!member && isModerator(member);
  if (action !== 'page' && (!guild || !staff)) {
    await reply('Only server admins and moderators can manage experts.');
    return;
  }
  const context = getGameContext(guild);
  if (!context.mastersEnabled || context.game !== game) {
    await reply('Experts are disabled or the setup changed. Reopen /experts.');
    return;
  }
  if (
    (action === 'save' && !interaction.isModalSubmit()) ||
    (action === 'select' && !interaction.isStringSelectMenu()) ||
    (!['save', 'select'].includes(action) && !interaction.isButton())
  ) {
    await reply('Use the controls in /experts.');
    return;
  }
  let saved = false;
  try {
    const snapshot = masterRosterRepository.snapshot(guild, game);
    if (revision !== snapshot.revision) {
      await reply('This menu is outdated. Reopen /experts.');
      return;
    }
    if (action === 'manage' && interaction.isButton()) {
      await interaction.reply({ ...mastersView(guild, user, game, true), ephemeral: true });
      return;
    }
    if (action === 'page' && interaction.isButton()) {
      await interaction.update(mastersView(guild, user, game, staff, page));
      return;
    }
    if (action === 'select' && interaction.isStringSelectMenu()) {
      const target = snapshot.entries
        .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
        .find((entry) => String(entry.id) === interaction.values[0]);
      if (!target || interaction.values.length !== 1) {
        await reply('Choose an expert from this page.');
        return;
      }
      await interaction.update(mastersView(guild, user, game, staff, page, target.id));
      return;
    }
    const target = snapshot.entries.find((entry) => entry.id === id);
    if (action !== 'add' && !(action === 'save' && id === 0) && !target) {
      await reply('Expert not found. Reopen /experts.');
      return;
    }
    const customId = (next: string) =>
      `masters:${next}:${guild}:${user}:${game}:${id}:${revision}:${page}`;
    if ((action === 'add' || action === 'edit') && interaction.isButton()) {
      const field = (key: string, label: string, max: number, value = '', required = true) => {
        const input = new TextInputBuilder()
          .setCustomId(key)
          .setLabel(label)
          .setStyle(TextInputStyle.Short)
          .setMaxLength(max)
          .setRequired(required);
        if (value) input.setValue(value);
        return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
      };
      await interaction.showModal(
        new ModalBuilder()
          .setCustomId(customId('save'))
          .setTitle(action === 'add' ? 'Add Expert' : 'Edit Expert')
          .addComponents(
            field('name', 'Name', 50, target?.name),
            field('year', 'Year', 4, target ? String(target.year) : ''),
            field('patch', 'Patch (optional)', 50, target?.patch, false),
          ),
      );
      return;
    }
    if (action === 'remove' && interaction.isButton()) {
      await interaction.update({
        content: `Remove the selected expert (${target!.year})?`,
        embeds: [buildMastersEmbed([target!], game)],
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(customId('confirm'))
              .setLabel('Confirm Removal')
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(customId('cancel'))
              .setLabel('Cancel')
              .setStyle(ButtonStyle.Secondary),
          ),
        ],
        allowedMentions: { parse: [] },
      });
      return;
    }
    if (action === 'cancel' && interaction.isButton()) {
      await interaction.update(mastersView(guild, user, game, staff, page, id));
      return;
    }
    let selected = id;
    if (action === 'save' && interaction.isModalSubmit()) {
      const year = interaction.fields.getTextInputValue('year').trim();
      if (!/^\d{4}$/.test(year)) throw new MasterValidationError('Enter a four-digit year.');
      const value = validateMaster(
        interaction.fields.getTextInputValue('name'),
        Number(year),
        interaction.fields.getTextInputValue('patch'),
      );
      selected = masterRosterRepository.change(guild!, game, revision, id, value);
    } else if (action === 'confirm' && interaction.isButton())
      masterRosterRepository.change(guild!, game, revision, id);
    else {
      await reply('Use the controls in /experts.');
      return;
    }
    saved = true;
    audit('MASTER_UPDATE', { guildId: guild, userId: user, game, masterId: selected, action });
    const nextEntries = masterRosterRepository.snapshot(guild, game).entries;
    const nextPage =
      action === 'save'
        ? Math.floor(
            Math.max(
              0,
              nextEntries.findIndex((entry) => entry.id === selected),
            ) / PAGE_SIZE,
          )
        : page;
    const view = mastersView(guild, user, game, staff, nextPage, selected);
    if (interaction.isModalSubmit()) await interaction.reply({ ...view, ephemeral: true });
    else await interaction.update(view);
  } catch (error) {
    logger.warn('Masters menu failed', {
      action,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    const content = saved
      ? 'Experts saved, but the menu could not refresh. Reopen /experts.'
      : error instanceof MasterValidationError
        ? error.message
        : 'Unable to update experts. Reopen /experts and try again.';
    if (interaction.replied || interaction.deferred)
      await interaction.followUp({ content, ephemeral: true });
    else await reply(content);
  }
}
