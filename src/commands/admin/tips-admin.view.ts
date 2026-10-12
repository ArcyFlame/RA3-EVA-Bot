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
import { Tip, TIP_FACTIONS, TipValidationError, validateTip } from '../../content/tips';
import { tipRepository } from '../../repositories/tip.repository';
import { requireModeratorInteraction } from '../../utils/admin-interaction';
import { getGameContext } from '../../utils/game-context';
import { tipCard } from '../info/tips.view';
import { audit, logger } from '../../utils/logger';
import { tipSettingsRepository } from '../../repositories/tip-settings.repository';
import {
  buildTipForm,
  buildTipSourcesForm,
  tipBasicsFromForm,
  tipSourcesFromForm,
  tipFromForm,
} from './tips-admin.form';
import { tipDrafts } from './tips-admin.drafts';

export function tipManagerView(
  guild: string,
  user: string,
  game: GameId,
  selected = 0,
  matches?: number[],
) {
  const tips = tipRepository.list(guild, game, true);
  const index = Math.max(
    0,
    tips.findIndex((tip) => tip.id === selected),
  );
  const tip = tips[index];
  const matching = matches ? tips.filter((entry) => matches.includes(entry.id)) : tips;
  const visible = matching.slice(0, 25);
  if (!matches && !visible.some((entry) => entry.id === tip.id)) visible[visible.length - 1] = tip;
  const revision = tipRepository.revision(guild, game);
  const id = (action: string, target = tip.id) =>
    `tipmgr:${action}:${guild}:${user}:${game}:${target}:${revision}`;
  const card = tipCard(tip, index + 1);
  card.embeds[0].addFields({
    name: 'Available factions for Add Tip / Edit Tip',
    value: Object.values(TIP_FACTIONS[game])
      .map((label) => `\`${label}\``)
      .join('\n'),
  });
  const settings = tipSettingsRepository.get(guild);
  const disabled = tipRepository.isDisabled(guild, game, tip.id);
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(id('add', 0)).setLabel('Add Tip').setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(id('edit'))
      .setLabel('Edit Tip')
      .setStyle(ButtonStyle.Primary)
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
      .setPlaceholder(matches ? 'Choose a matching tip' : 'Choose a tip')
      .addOptions(
        visible.map((entry) => ({
          label: `#${tips.findIndex((item) => item.id === entry.id) + 1} ${entry.title}`.slice(
            0,
            100,
          ),
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
  const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(id(settings.visibility === 'public' ? 'private' : 'public'))
      .setLabel(settings.visibility === 'public' ? 'Make Tips Private' : 'Make Tips Public')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(id(settings.enabled ? 'disable' : 'enable'))
      .setLabel(settings.enabled ? 'Disable Tips' : 'Enable Tips')
      .setStyle(settings.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
  );
  if (tips.length > 25)
    controls.addComponents(
      new ButtonBuilder()
        .setCustomId(id('find'))
        .setLabel('Find Tip')
        .setStyle(ButtonStyle.Secondary),
    );
  return {
    ...card,
    content:
      `**Gameplay tips: ${settings.enabled ? 'Enabled' : 'Disabled'}**\n/tips replies: **${settings.visibility === 'public' ? 'Public - everyone in the channel' : 'Private - only the requester'}**\nTip #${index + 1}: ${disabled ? 'Disabled' : 'Enabled'} - Changes affect this server only.` +
      (tips.length > 25
        ? `\n${visible.length} of ${matching.length} ${matches ? 'matching ' : ''}tips shown. Use Find Tip to search by number or title.`
        : ''),
    components: [browser, buttons, controls],
  };
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
    /^tipmgr:(add|edit|draft|details|finish|cancel|quote|save|saveform|savequote|select|faction|browse|remove|confirm|restore|visibility|public|private|find|search|enable|disable):([0-9]{17,20}):([0-9]{17,20}):(ra3|genevo):([0-9]{1,9}):([0-9]{1,9})(?::([a-f0-9]{16}))?$/.exec(
      interaction.customId,
    );
  if (!match || match[2] !== interaction.guildId || match[3] !== interaction.user.id) {
    await interaction.reply({
      content: 'Open your own /bot tips menu in this server.',
      ephemeral: true,
    });
    return;
  }
  if (!(await requireModeratorInteraction(interaction))) return;
  const [, action, guild, user, rawGame, rawId, rawRevision, token] = match;
  const game = rawGame as GameId;
  const id = Number(rawId),
    revision = Number(rawRevision);
  if (game !== getGameContext(guild).game || revision !== tipRepository.revision(guild, game)) {
    await interaction.reply({
      content: 'This menu is outdated. Open /bot tips again.',
      ephemeral: true,
    });
    return;
  }
  const tips = tipRepository.list(guild, game, true);
  const tip = tips.find((entry) => entry.id === id);
  const isNew =
    id === 0 &&
    ['add', 'draft', 'details', 'finish', 'cancel', 'save', 'saveform'].includes(action);
  if (!tip && !isNew) {
    await interaction.reply({ content: 'Tip not found. Open /bot tips again.', ephemeral: true });
    return;
  }
  if (
    (['select', 'faction', 'visibility'].includes(action) && !interaction.isStringSelectMenu()) ||
    (['draft', 'finish', 'save', 'savequote', 'saveform', 'search'].includes(action) &&
      !interaction.isModalSubmit()) ||
    ([
      'add',
      'edit',
      'quote',
      'browse',
      'remove',
      'confirm',
      'restore',
      'enable',
      'disable',
      'public',
      'private',
      'find',
      'details',
      'cancel',
    ].includes(action) &&
      !interaction.isButton())
  ) {
    await interaction.reply({ content: 'Use the buttons in /bot tips.', ephemeral: true });
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
  if ((action === 'add' || action === 'edit') && interaction.isButton()) {
    await interaction.showModal(
      buildTipForm(
        `tipmgr:draft:${guild}:${user}:${game}:${id}:${revision}`,
        game,
        action === 'add' ? undefined : tip,
      ),
    );
    return;
  }
  if (action === 'find' && interaction.isButton()) {
    await interaction.showModal(
      new ModalBuilder()
        .setTitle('Find Tip')
        .setCustomId(`tipmgr:search:${guild}:${user}:${game}:${id}:${revision}`)
        .addComponents(field('query', 'Tip number or title', 80)),
    );
    return;
  }
  if (action === 'search' && interaction.isModalSubmit()) {
    const query = interaction.fields.getTextInputValue('query').trim();
    const number = /^#?\d+$/.test(query) ? Number(query.replace(/^#/, '')) : undefined;
    const found =
      number !== undefined
        ? tips.filter((_, index) => index + 1 === number)
        : tips.filter((entry) => query && entry.title.toLowerCase().includes(query.toLowerCase()));
    await interaction.reply(
      found.length
        ? {
            ...tipManagerView(
              guild,
              user,
              game,
              found[0].id,
              found.map((entry) => entry.id),
            ),
            ephemeral: true,
          }
        : {
            content: 'No matching tip. Search by the displayed number or part of its title.',
            ephemeral: true,
          },
    );
    return;
  }
  // Older open menus can still submit their existing quote form.
  if (action === 'quote' && interaction.isButton()) {
    const modal = new ModalBuilder()
      .setCustomId(`tipmgr:savequote:${guild}:${user}:${game}:${id}:${revision}`)
      .setTitle('Quote and Original Speaker')
      .addComponents(
        field('quote', 'Real quote (blank removes it)', 180, tip?.quote?.text, false, true),
        field('speaker', 'Unit or general', 80, tip?.quote?.speaker, false),
        field('source', 'Quote source - HTTPS link', 500, tip?.quote?.source, false),
      );
    await interaction.showModal(modal);
    return;
  }
  if (action === 'remove' && interaction.isButton()) {
    await interaction.update({
      content: `Remove Tip #${tipRepository.displayNumber(guild, game, id)} from this server? Built-in tips can be restored.`,
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
  let saved = false;
  try {
    let selected = id;
    const scope = { guild, user, game, id, revision };
    if (action === 'draft' && interaction.isModalSubmit()) {
      const draft = validateTip(tipBasicsFromForm(interaction, game, id, tip));
      const draftToken = tipDrafts.create(scope, draft);
      const draftId = (next: string) =>
        `tipmgr:${next}:${guild}:${user}:${game}:${id}:${revision}:${draftToken}`;
      await interaction.reply({
        content:
          'Step 1 of 2 complete. Nothing has been saved yet. Continue to the separate Quote, Speaker, Quote source and Tip source fields. All four are optional; leave them blank if not needed and submit to save. Draft expires in 15 minutes.',
        ephemeral: true,
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(draftId('details'))
              .setLabel('Continue to Step 2')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId(draftId('cancel'))
              .setLabel('Cancel Draft')
              .setStyle(ButtonStyle.Secondary),
          ),
        ],
        allowedMentions: { parse: [] },
      });
      return;
    } else if (action === 'details' && interaction.isButton()) {
      const draft = tipDrafts.get(token, scope);
      await interaction.showModal(
        buildTipSourcesForm(
          `tipmgr:finish:${guild}:${user}:${game}:${id}:${revision}:${token}`,
          draft,
        ),
      );
      return;
    } else if (action === 'cancel' && interaction.isButton()) {
      tipDrafts.get(token, scope);
      tipDrafts.remove(token!);
      await interaction.update({
        content: 'Draft cancelled. No changes were saved.',
        components: [],
        embeds: [],
      });
      return;
    } else if (action === 'finish' && interaction.isModalSubmit()) {
      const draft = tipDrafts.get(token, scope);
      selected = tipRepository.change(
        guild,
        game,
        revision,
        'save',
        id,
        tipSourcesFromForm(interaction, draft),
      );
      tipDrafts.remove(token!);
    } else if (action === 'saveform' && interaction.isModalSubmit()) {
      selected = tipRepository.change(
        guild,
        game,
        revision,
        'save',
        id,
        tipFromForm(interaction, game, id),
      );
    } else if (action === 'public' || action === 'private') {
      tipSettingsRepository.setVisibility(guild, action);
    } else if (action === 'visibility' && interaction.isStringSelectMenu()) {
      const visibility = interaction.values[0];
      if (
        interaction.values.length !== 1 ||
        (visibility !== 'public' && visibility !== 'private')
      ) {
        await interaction.reply({ content: 'Choose Public or Private.', ephemeral: true });
        return;
      }
      tipSettingsRepository.setVisibility(guild, visibility);
    } else if (action === 'enable' || action === 'disable') {
      tipSettingsRepository.setEnabled(guild, action === 'enable');
    } else if (action === 'save' && interaction.isModalSubmit()) {
      const edited: Tip = {
        id: id || 1000,
        game,
        faction: tip?.faction ?? 'general',
        origin: 'server',
        ruleset: 'Server tip',
        title: interaction.fields.getTextInputValue('title').trim(),
        text: interaction.fields.getTextInputValue('text').trim(),
        source: interaction.fields.getTextInputValue('source').trim(),
        footer: interaction.fields.fields.has('footer')
          ? interaction.fields.getTextInputValue('footer').trim() || undefined
          : tip?.footer,
      };
      // Footer-only edits keep the quote; rewritten advice must not inherit an unrelated line.
      if (
        tip &&
        edited.title === tip.title &&
        edited.text === tip.text &&
        edited.source === tip.source
      )
        edited.quote = tip.quote;
      selected = tipRepository.change(guild, game, revision, 'save', id, edited);
    } else if (action === 'savequote' && interaction.isModalSubmit() && tip) {
      const text = interaction.fields.getTextInputValue('quote').trim();
      const speaker = interaction.fields.fields.has('speaker')
        ? interaction.fields.getTextInputValue('speaker').trim()
        : '';
      const source = interaction.fields.fields.has('source')
        ? interaction.fields.getTextInputValue('source').trim()
        : '';
      const quote =
        text || speaker || source
          ? {
              text,
              speaker,
              source,
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
      await interaction.reply({ content: 'Use the buttons in /bot tips.', ephemeral: true });
      return;
    }
    saved = true;
    audit('TIP_UPDATE', { guildId: guild, userId: user, game, tipId: selected, action });
    const view = tipManagerView(guild, user, game, selected);
    if (interaction.isModalSubmit()) await interaction.reply({ ...view, ephemeral: true });
    else await interaction.update(view);
  } catch (error) {
    logger.warn('Tip manager update failed', {
      action,
      error:
        error instanceof Error ? { name: error.name, message: error.message } : 'Unknown error',
    });
    const response = {
      content: saved
        ? 'Tip saved, but the menu could not refresh. Reopen /bot tips to see it.'
        : error instanceof TipValidationError
          ? `Tip not saved: ${error.message}`
          : 'Unable to update this tip. Reopen /bot tips and try again.',
      ephemeral: true,
      allowedMentions: { parse: [] as [] },
    };
    if (interaction.deferred || interaction.replied) await interaction.followUp(response);
    else await interaction.reply(response);
  }
}
