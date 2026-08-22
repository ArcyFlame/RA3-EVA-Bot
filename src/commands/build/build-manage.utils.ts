import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { BuildOrder } from '../../repositories/build-order.repository';
import { UNIT_EMOJIS } from '../../utils/unit-emojis';

/**
 * Management panel shown after /build_create (and reusable anywhere):
 * View / Edit / Delete / Insert-emoji picker with pagination.
 */

export function renderBuildPanel(build: BuildOrder): {
  embeds: [EmbedBuilder];
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const embed = new EmbedBuilder()
    .setTitle(`📜 ${build.name}`)
    .setDescription(build.content.slice(0, 4000))
    .setColor(0x00ae86)
    .addFields({ name: 'Author', value: `<@${build.userId}>`, inline: true })
    .setFooter({ text: `Build #${build.id} · manage it below (owner only)` });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`buildmg_edit_${build.id}`)
      .setLabel('✏️ Edit')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`buildmg_emoji_${build.id}_0`)
      .setLabel('😀 Insert Emoji')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`buildmg_del_${build.id}`)
      .setLabel('🗑️ Delete')
      .setStyle(ButtonStyle.Danger),
  );
  return { embeds: [embed], components: [row] };
}

const EMOJI_PAGE_SIZE = 20;

/**
 * Emoji picker page: every emoji in the catalog, 20 per page, ◀/▶ to move.
 * Clicking an emoji appends its code to the build content. The embed also
 * renders every emoji inline (Discord shows custom emoji inside embed text),
 * so users can SEE what each button inserts even where button emojis fail.
 */
export function renderEmojiPicker(build: BuildOrder, page: number): {
  embeds: [EmbedBuilder];
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const keys = Object.keys(UNIT_EMOJIS);
  const pageCount = Math.ceil(keys.length / EMOJI_PAGE_SIZE);
  const safePage = Math.min(Math.max(0, page), Math.max(0, pageCount - 1));
  const slice = keys.slice(safePage * EMOJI_PAGE_SIZE, (safePage + 1) * EMOJI_PAGE_SIZE);

  // Visible cheat-sheet: rendered emoji → its code (`<:name:id>` works as-is
  // in build orders; the short key is what the buttons insert).
  const cheatSheet = slice
    .map((key) => `${UNIT_EMOJIS[key]} \`${key}\``)
    .join('\n')
    .slice(0, 3800);

  const embed = new EmbedBuilder()
    .setTitle('😀 Unit Emoji Picker')
    .setDescription(
      'Click a button to append that emoji to your build.\n\n' +
        cheatSheet +
        '\n\nSoviet/Empire emojis appear automatically once uploaded to the server.',
    )
    .setColor(0x00ae86)
    .setFooter({ text: `Page ${safePage + 1}/${pageCount} · ${keys.length} emojis` });

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < slice.length; i += 5) {
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...slice.slice(i, i + 5).map((key) => {
          const emoji = UNIT_EMOJIS[key];
          return new ButtonBuilder()
            .setCustomId(`buildemoji_add_${build.id}_${key}`)
            .setLabel(key.replace(/_/g, ' ').slice(0, 60))
            .setEmoji(emoji.match(/\d{15,25}/)?.[0] ?? emoji)
            .setStyle(ButtonStyle.Secondary);
        }),
      ),
    );
  }
  if (pageCount > 1 && components.length < 5) {
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`buildmg_emoji_${build.id}_${safePage - 1}`)
          .setLabel('◀ Prev')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(safePage === 0),
        new ButtonBuilder()
          .setCustomId(`buildmg_emoji_${build.id}_${safePage + 1}`)
          .setLabel('Next ▶')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(safePage >= pageCount - 1),
        new ButtonBuilder()
          .setCustomId(`buildmg_back_${build.id}`)
          .setLabel('↩ Back to build')
          .setStyle(ButtonStyle.Primary),
      ),
    );
  }
  return { embeds: [embed], components };
}
