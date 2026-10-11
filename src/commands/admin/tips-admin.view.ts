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
import { TIP_FACTIONS, Tip } from '../../content/tips';
import { tipRepository } from '../../repositories/tip.repository';
import { requireModeratorInteraction } from '../../utils/admin-interaction';
import { getGameContext } from '../../utils/game-context';
import { tipCard } from '../info/tips.view';
import { audit, logger } from '../../utils/logger';

const PAGE_SIZE = 25;
export function tipManagerView(guild: string, user: string, game: GameId, selected = 0) {
  const tips = tipRepository.list(guild, game, true);
  const index = Math.max(
    0,
    tips.findIndex((tip) => tip.id === selected),
  );
  const tip = tips[index];
  const page = Math.floor(index / PAGE_SIZE);
  const revision = tipRepository.revision(guild, game);
  const id = (action: string, target = tip.id) =>
    `tipmgr:${action}:${guild}:${user}:${game}:${target}:${revision}`;
  const card = tipCard(tip);
  const disabled = tipRepository.isDisabled(guild, game, tip.id);
  card.embeds[0].setFooter({
    text: `${disabled ? 'Disabled' : tip.origin === 'curated' ? tip.ruleset : 'Server tip'} - Changes affect this server only`,
  });
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(id('add', 0)).setLabel('Add Tip').setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(id('edit'))
      .setLabel('Edit Tip')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(id('quote'))
      .setLabel('Edit Quote')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(id('remove'))
      .setLabel('Remove Tip')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(id('restore'))
      .setLabel('Restore Default')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(tip.id >= 1000),
  );
  const browser = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(id('select'))
      .setPlaceholder(`Choose a tip - page ${page + 1}`)
      .addOptions(
        tips.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((entry) => ({
          label: `#${entry.id} ${entry.title}`.slice(0, 100),
          value: String(entry.id),
          description: tipRepository.isDisabled(guild, game, entry.id)
            ? 'Disabled - restore to enable'
            : entry.origin === 'curated'
              ? entry.ruleset
              : 'Server tip',
          default: entry.id === tip.id,
        })),
      ),
  );
  const factions = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(id('faction'))
      .setPlaceholder('Choose a faction')
      .setDisabled(disabled)
      .addOptions(
        Object.entries(TIP_FACTIONS[game]).map(([value, label]) => ({
          value,
          label,
          default: value === tip.faction,
        })),
      ),
  );
  const pages = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(id('browse', tips[Math.max(0, (page - 1) * PAGE_SIZE)].id))
      .setLabel('Previous Page')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(id('browse', tips[Math.min(tips.length - 1, (page + 1) * PAGE_SIZE)].id))
      .setLabel('Next Page')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled((page + 1) * PAGE_SIZE >= tips.length),
  );
  return { ...card, components: [browser, factions, buttons, pages, ...card.components] };
}

function field(
  id: string,
  label: string,
  max: number,
  value = '',
  required = true,
  paragraph = false,
) {
  const input = new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setMaxLength(max)
    .setRequired(required)
    .setStyle(paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short);
  if (value) input.setValue(value);
  return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
}
export async function handleTipManager(
  interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
) {
  const match =
    /^tipmgr:(add|edit|quote|save|savequote|select|faction|browse|remove|confirm|restore):([0-9]{17,20}):([0-9]{17,20}):(ra3|genevo):([0-9]{1,9}):([0-9]{1,9})$/.exec(
      interaction.customId,
    );
  if (!match || match[2] !== interaction.guildId || match[3] !== interaction.user.id) {
    await interaction.reply({
      content: 'Open your own /admin tips menu in this server.',
      ephemeral: true,
    });
    return;
  }
  if (!(await requireModeratorInteraction(interaction))) return;
  const [, action, guild, user, rawGame, rawId, rawRevision] = match;
  const game = rawGame as GameId;
  const id = Number(rawId),
    revision = Number(rawRevision);
  if (game !== getGameContext(guild).game || revision !== tipRepository.revision(guild, game)) {
    await interaction.reply({
      content: 'This menu is outdated. Open /admin tips again.',
      ephemeral: true,
    });
    return;
  }
  const tips = tipRepository.list(guild, game, true);
  const tip = tips.find((entry) => entry.id === id);
  const isNew = id === 0 && (action === 'add' || action === 'save');
  if (!tip && !isNew) {
    await interaction.reply({ content: 'Tip not found. Open /admin tips again.', ephemeral: true });
    return;
  }
  if (
    ((action === 'select' || action === 'faction') && !interaction.isStringSelectMenu()) ||
    ((action === 'save' || action === 'savequote') && !interaction.isModalSubmit()) ||
    (['add', 'edit', 'quote', 'browse', 'remove', 'confirm', 'restore'].includes(action) &&
      !interaction.isButton())
  ) {
    await interaction.reply({ content: 'Use the buttons in /admin tips.', ephemeral: true });
    return;
  }
  if (action === 'select' && interaction.isStringSelectMenu()) {
    const target = tips.find((entry) => String(entry.id) === interaction.values[0]);
    if (!target) {
      await interaction.reply({ content: 'Choose an existing tip.', ephemeral: true });
      return;
    }
    await interaction.update(tipManagerView(guild, user, game, target.id));
    return;
  }
  if (action === 'browse' && interaction.isButton()) {
    await interaction.update(tipManagerView(guild, user, game, id));
    return;
  }
  if ((action === 'add' || action === 'edit' || action === 'quote') && interaction.isButton()) {
    const modal = new ModalBuilder()
      .setCustomId(
        `tipmgr:${action === 'quote' ? 'savequote' : 'save'}:${guild}:${user}:${game}:${id}:${revision}`,
      )
      .setTitle(
        action === 'quote'
          ? 'Quote and Original Speaker'
          : action === 'add'
            ? 'Add Gameplay Tip'
            : 'Edit Gameplay Tip',
      );
    if (action === 'quote')
      modal.addComponents(
        field('quote', 'Real quote (blank removes it)', 180, tip?.quote?.text, false, true),
        field('speaker', 'Unit or general', 80, tip?.quote?.speaker, false),
        field('source', 'Quote source - HTTPS link', 500, tip?.quote?.source, false),
      );
    else
      modal.addComponents(
        field('title', 'Short title', 80, action === 'add' ? '' : tip?.title),
        field(
          'text',
          'Tip - current game rules only',
          1200,
          action === 'add' ? '' : tip?.text,
          true,
          true,
        ),
        field('source', 'Tip source - HTTPS link', 500, action === 'add' ? '' : tip?.source),
      );
    await interaction.showModal(modal);
    return;
  }
  if (action === 'remove' && interaction.isButton()) {
    await interaction.update({
      content: `Remove Tip #${id} from this server? Built-in tips can be restored.`,
      embeds: [],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`tipmgr:confirm:${guild}:${user}:${game}:${id}:${revision}`)
            .setLabel('Confirm Removal')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`tipmgr:browse:${guild}:${user}:${game}:${id}:${revision}`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary),
        ),
      ],
      allowedMentions: { parse: [] },
    });
    return;
  }
  try {
    let selected = id;
    if (action === 'save' && interaction.isModalSubmit()) {
      const edited: Tip = {
        id: id || 1000,
        game,
        faction: tip?.faction ?? 'general',
        origin: 'server',
        ruleset: 'Server tip',
        title: interaction.fields.getTextInputValue('title').trim(),
        text: interaction.fields.getTextInputValue('text').trim(),
        source: interaction.fields.getTextInputValue('source').trim(),
      };
      // A rewritten tip must not inherit a quote about its previous subject.
      selected = tipRepository.change(guild, game, revision, 'save', id, edited);
    } else if (action === 'savequote' && interaction.isModalSubmit() && tip) {
      const text = interaction.fields.getTextInputValue('quote').trim();
      const quote = text
        ? {
            text,
            speaker: interaction.fields.getTextInputValue('speaker').trim(),
            source: interaction.fields.getTextInputValue('source').trim(),
            game: game === 'ra3' ? ('Red Alert 3' as const) : ('Generals / Zero Hour' as const),
          }
        : undefined;
      tipRepository.change(guild, game, revision, 'save', id, { ...tip, quote });
    } else if (action === 'faction' && interaction.isStringSelectMenu() && tip) {
      tipRepository.change(guild, game, revision, 'save', id, {
        ...tip,
        faction: interaction.values[0],
        quote: undefined,
      });
    } else if (action === 'confirm' || action === 'restore') {
      tipRepository.change(guild, game, revision, action === 'confirm' ? 'remove' : 'restore', id);
    } else {
      await interaction.reply({ content: 'Use the buttons in /admin tips.', ephemeral: true });
      return;
    }
    audit('TIP_UPDATE', { guildId: guild, userId: user, game, tipId: selected, action });
    const view = { ...tipManagerView(guild, user, game, selected), content: 'Tip settings saved.' };
    if (interaction.isModalSubmit()) await interaction.reply({ ...view, ephemeral: true });
    else await interaction.update(view);
  } catch (error) {
    logger.warn('Tip manager update failed', { action, error });
    await interaction.reply({
      content:
        'Unable to update this tip. Check the field limits, faction and HTTPS sources, or reopen /admin tips.',
      ephemeral: true,
    });
  }
}
