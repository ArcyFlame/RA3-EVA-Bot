import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  escapeMarkdown,
} from 'discord.js';
import { Tip, TIP_FACTIONS } from '../../content/tips';
import {
  RA3_LOGO,
  GENEVO_LOGO,
  FACTION_ALLIED,
  FACTION_SOVIET,
  FACTION_EMPIRE,
  FACTION_USA,
  FACTION_CHINA,
  FACTION_GLA,
} from '../../utils/emojis';

export function tipCard(tip: Tip) {
  const base = tip.faction.split('_')[0];
  const icon =
    (
      {
        allies: FACTION_ALLIED,
        soviets: FACTION_SOVIET,
        empire: FACTION_EMPIRE,
        usa: FACTION_USA,
        china: FACTION_CHINA,
        gla: FACTION_GLA,
      } as Record<string, string>
    )[base] ?? '';
  const faction = (TIP_FACTIONS[tip.game] as Record<string, string>)[tip.faction];
  const color =
    (
      {
        allies: 0x3b82f6,
        soviets: 0xef4444,
        empire: 0xf59e0b,
        usa: 0x3b82f6,
        china: 0xef4444,
        gla: 0x22c55e,
      } as Record<string, number>
    )[base] ?? 0xe67e22;
  const quote = tip.quote;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setDescription(
      `### ${tip.game === 'ra3' ? RA3_LOGO : GENEVO_LOGO} Tip #${tip.id}\n\n` +
        `${icon ? icon + ' ' : ''}**${faction} - ${escapeMarkdown(tip.title)}**\n${escapeMarkdown(tip.text)}` +
        (quote
          ? `\n\n> ${escapeMarkdown(quote.text)}\n- ${escapeMarkdown(quote.speaker)} (${quote.game})`
          : ''),
    )
    .setFooter({ text: tip.origin === 'curated' ? tip.ruleset : 'Server tip - supplied by staff' });
  const links = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Tip Source').setURL(tip.source),
  );
  if (quote)
    links.addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Quote Source').setURL(quote.source),
    );
  return { embeds: [embed], components: [links], allowedMentions: { parse: [] as [] } };
}
