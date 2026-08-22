import {
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  StringSelectMenuInteraction,
} from 'discord.js';
import {
  buildMainEmbed,
  buildTournamentsEmbed,
  buildCommunityEmbed,
  buildProfileEmbed,
  buildInfoEmbed,
  buildAdminEmbed,
  buildModerationEmbed,
} from './help.embeds';

export class HelpView {
  private embed: EmbedBuilder;
  private components: ActionRowBuilder<StringSelectMenuBuilder>[];
  private isAdmin: boolean;
  private mainEmbed: EmbedBuilder;
  private hidden: Set<string>;

  constructor(isAdmin: boolean, mainEmbed?: EmbedBuilder, hidden: string[] = []) {
    this.isAdmin = isAdmin;
    this.mainEmbed = mainEmbed ?? buildMainEmbed();
    this.embed = this.mainEmbed;
    this.hidden = new Set(hidden);
    this.components = this.buildComponents();
  }

  private buildComponents(): ActionRowBuilder<StringSelectMenuBuilder>[] {
    const options = [
      new StringSelectMenuOptionBuilder().setLabel('Main Menu').setValue('main').setEmoji('📚'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Tournaments')
        .setValue('tournaments')
        .setEmoji('🏆'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Community')
        .setValue('community')
        .setEmoji('👥'),
      new StringSelectMenuOptionBuilder().setLabel('Profile').setValue('profile').setEmoji('👤'),
      new StringSelectMenuOptionBuilder().setLabel('Information').setValue('info').setEmoji('ℹ️'),
    ];
    if (this.isAdmin) {
      options.push(
        new StringSelectMenuOptionBuilder()
          .setLabel('Admin Tools')
          .setValue('admin')
          .setEmoji('🛠️'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Moderation')
          .setValue('moderation')
          .setEmoji('🔨'),
      );
    }
    // Admins can hide categories per guild (/toggle → Help Categories).
    const all: Array<{ value: string; option: StringSelectMenuOptionBuilder }> = [
      { value: 'main', option: options[0] },
      { value: 'tournaments', option: options[1] },
      { value: 'community', option: options[2] },
      { value: 'profile', option: options[3] },
      { value: 'info', option: options[4] },
    ];
    if (this.isAdmin) {
      all.push({ value: 'admin', option: options[5] }, { value: 'moderation', option: options[6] });
    }
    const visible = all.filter((o) => !this.hidden.has(o.value));
    const select = new StringSelectMenuBuilder()
      .setCustomId('help_category')
      .setPlaceholder('Select a category...')
      .addOptions(...(visible.length > 0 ? visible.map((o) => o.option) : [all[0].option]));
    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
    return [row];
  }

  getEmbed(): EmbedBuilder {
    return this.embed;
  }

  getComponents(): ActionRowBuilder<StringSelectMenuBuilder>[] {
    return this.components;
  }

  async handleSelect(interaction: StringSelectMenuInteraction, value: string) {
    let newEmbed: EmbedBuilder;
    switch (value) {
      case 'main':
        newEmbed = this.mainEmbed;
        break;
      case 'tournaments':
        newEmbed = buildTournamentsEmbed();
        break;
      case 'community':
        newEmbed = buildCommunityEmbed();
        break;
      case 'profile':
        newEmbed = buildProfileEmbed();
        break;
      case 'info':
        newEmbed = buildInfoEmbed();
        break;
      case 'admin':
        newEmbed = buildAdminEmbed();
        break;
      case 'moderation':
        newEmbed = buildModerationEmbed();
        break;
      default:
        newEmbed = this.mainEmbed;
    }
    this.embed = newEmbed;
    await interaction.update({ embeds: [this.embed], components: this.components });
  }
}
