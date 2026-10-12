import {
  ActionRowBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { GameId } from '../../config/games';
import { Tip, TIP_FACTIONS, TipValidationError } from '../../content/tips';

function input(
  id: string,
  label: string,
  max: number,
  value: string,
  required = true,
  paragraph = false,
  placeholder?: string,
) {
  const field = new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setMaxLength(max)
    .setRequired(required)
    .setStyle(paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short);
  if (value) field.setValue(value);
  if (placeholder) field.setPlaceholder(placeholder);
  return new ActionRowBuilder<TextInputBuilder>().addComponents(field);
}

export function formatTipDetails(tip?: Tip): string {
  return `Quote: ${tip?.quote?.text ?? ''}\nSpeaker: ${tip?.quote?.speaker ?? ''}\nQuote source: ${tip?.quote?.source ?? ''}\nTip source: ${tip?.source ?? ''}`;
}

export function buildTipForm(customId: string, game: GameId, tip?: Tip) {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(tip ? 'Edit Tip - Step 1 of 2' : 'Add Tip - Step 1 of 2')
    .addComponents(
      input('title', 'Short title', 80, tip?.title ?? ''),
      input(
        'faction',
        game === 'ra3'
          ? 'General, Allies, Soviets or Empire'
          : 'Faction / subfaction (see admin menu list)',
        80,
        tip ? (TIP_FACTIONS[game] as Record<string, string>)[tip.faction] : 'General',
        true,
        false,
        game === 'ra3'
          ? 'General, Allies, Soviets, Empire'
          : 'General, USA, China, GLA, or USA | Air Force General',
      ),
      input('text', 'Tip description', 1200, tip?.text ?? '', true, true),
      input('footer', 'Footer (blank uses default)', 200, tip?.footer ?? '', false),
    );
}

export function buildTipSourcesForm(customId: string, tip: Tip) {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle('Quote and Sources - Step 2 of 2')
    .addComponents(
      input('quote', 'Quote (optional)', 180, tip.quote?.text ?? '', false, true),
      input('speaker', 'Speaker (optional)', 80, tip.quote?.speaker ?? '', false),
      input(
        'quote_source',
        'Quote source (optional HTTPS link)',
        500,
        tip.quote?.source ?? '',
        false,
      ),
      input('tip_source', 'Tip source (optional HTTPS link)', 500, tip.source, false),
    );
}

export function tipBasicsFromForm(
  interaction: ModalSubmitInteraction,
  game: GameId,
  id: number,
  original?: Tip,
): Tip {
  const text = (field: string) => interaction.fields.getTextInputValue(field).trim();
  return {
    id: id || 1000,
    game,
    origin: 'server',
    ruleset: 'Server tip',
    title: text('title'),
    faction: parseTipFaction(game, text('faction')),
    text: text('text'),
    footer: text('footer') || undefined,
    source: original?.source ?? '',
    quote: original?.quote,
  };
}

export function tipSourcesFromForm(interaction: ModalSubmitInteraction, draft: Tip): Tip {
  const text = (field: string) => interaction.fields.getTextInputValue(field).trim();
  const quote = text('quote');
  const speaker = text('speaker');
  const source = text('quote_source');
  return {
    ...draft,
    source: text('tip_source'),
    quote:
      quote || speaker || source
        ? {
            text: quote,
            speaker,
            source,
            game: draft.game === 'ra3' ? 'Red Alert 3' : 'Generals / Zero Hour',
          }
        : undefined,
  };
}

function factionKey(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\bnuclear\b/g, 'nuke')
    .replace(/[\s|_-]+/g, ' ')
    .replace(/ general$/, '');
}

export function parseTipFaction(game: GameId, value: string): string {
  const key = factionKey(value);
  const match = Object.entries(TIP_FACTIONS[game]).find(
    ([id, label]) => factionKey(label) === key || factionKey(id) === key,
  );
  if (!match)
    throw new TipValidationError(
      `Unknown faction. Use ${Object.values(TIP_FACTIONS[game]).join(', ')}.`,
    );
  return match[0];
}

export function parseTipDetails(game: GameId, value: string): Pick<Tip, 'source' | 'quote'> {
  const values = new Map<string, string>();
  for (const raw of value.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const line = /^(Quote|Speaker|Quote source|Tip source):\s*(.*)$/i.exec(raw.trim());
    if (!line || values.has(line[1].toLowerCase()))
      throw new TipValidationError(
        'Use one labelled line each: Quote:, Speaker:, Quote source:, Tip source:.',
      );
    values.set(line[1].toLowerCase(), line[2].trim());
  }
  const text = values.get('quote') ?? '';
  const speaker = values.get('speaker') ?? '';
  const source = values.get('quote source') ?? '';
  return {
    source: values.get('tip source') ?? '',
    quote:
      text || speaker || source
        ? { text, speaker, source, game: game === 'ra3' ? 'Red Alert 3' : 'Generals / Zero Hour' }
        : undefined,
  };
}

export function tipFromForm(interaction: ModalSubmitInteraction, game: GameId, id: number): Tip {
  const text = (field: string) => interaction.fields.getTextInputValue(field).trim();
  return {
    id: id || 1000,
    game,
    origin: 'server',
    ruleset: 'Server tip',
    title: text('title'),
    faction: parseTipFaction(game, text('faction')),
    text: text('text'),
    footer: text('footer') || undefined,
    ...parseTipDetails(game, text('details')),
  };
}
