import {
  Guild,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  LabelBuilder,
  FileUploadBuilder,
  ButtonInteraction,
  ModalSubmitInteraction,
  RepliableInteraction,
} from 'discord.js';
import { requireAdminInteraction } from '../../utils/admin-interaction';
import {
  botProfileSettings,
  botProfileService,
  profileImage,
} from '../../services/bot-profile.service';
import { audit } from '../../utils/logger';

export function botProfileView(guild: Guild, userId: string, notice?: string) {
  const settings = botProfileSettings(guild.id);
  const embed = new EmbedBuilder()
    .setTitle('🖼️ Bot Server Profile')
    .setColor(0x5865f2)
    .setDescription(
      'Change the bot profile on this server only. The global bot account and other servers are not changed. Image uploads use Discord’s file picker; direct PNG/JPEG links are supported too.',
    )
    .addFields(
      {
        name: 'Nickname',
        value: settings.nickname || guild.members.me?.displayName || 'Default',
        inline: true,
      },
      { name: 'Description', value: settings.description || 'Default', inline: false },
    );
  const avatar = guild.members.me?.displayAvatarURL();
  if (avatar) embed.setThumbnail(avatar);
  if (notice) embed.addFields({ name: 'Update', value: notice });
  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...(['nickname', 'avatar', 'banner', 'description', 'reset'] as const).map((field) =>
          new ButtonBuilder()
            .setCustomId(`bot_profile:${field}:${userId}`)
            .setLabel(
              {
                nickname: 'Nickname',
                avatar: 'Avatar',
                banner: 'Banner',
                description: 'Description',
                reset: 'Restore Defaults',
              }[field],
            )
            .setStyle(field === 'reset' ? ButtonStyle.Danger : ButtonStyle.Secondary),
        ),
      ),
    ],
    allowedMentions: { parse: [] as [] },
  };
}
export async function openBotProfile(interaction: RepliableInteraction) {
  if (!(await requireAdminInteraction(interaction)) || !interaction.guild) return;
  await interaction.reply({
    ...botProfileView(interaction.guild, interaction.user.id),
    ephemeral: true,
  });
}
export async function handleBotProfile(interaction: ButtonInteraction | ModalSubmitInteraction) {
  const match =
    /^bot_profile:(nickname|avatar|banner|description|reset|save_nickname|save_avatar|save_banner|save_description):(\d{17,20})$/.exec(
      interaction.customId,
    );
  if (!match || match[2] !== interaction.user.id) {
    await interaction.reply({ content: 'Open your own /bot profile menu.', ephemeral: true });
    return;
  }
  if (!(await requireAdminInteraction(interaction)) || !interaction.guild) return;
  const field = match[1].replace('save_', '') as
    | 'nickname'
    | 'description'
    | 'avatar'
    | 'banner'
    | 'reset';
  if (interaction.isButton() && field !== 'reset') {
    const modal = new ModalBuilder()
      .setCustomId(`bot_profile:save_${field}:${interaction.user.id}`)
      .setTitle('Bot ' + field);
    if (field === 'avatar' || field === 'banner')
      modal.addLabelComponents(
        new LabelBuilder()
          .setLabel('Image URL (optional)')
          .setTextInputComponent(
            new TextInputBuilder()
              .setCustomId('url')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setMaxLength(1000),
          ),
        new LabelBuilder()
          .setLabel('Upload an image instead (optional)')
          .setDescription('PNG/JPEG, up to 2 MB. Choose upload OR URL.')
          .setFileUploadComponent(
            new FileUploadBuilder().setCustomId('image').setRequired(false).setMaxValues(1),
          ),
      );
    else
      modal.addLabelComponents(
        new LabelBuilder()
          .setLabel(field === 'nickname' ? 'Server nickname' : 'Server profile description')
          .setTextInputComponent(
            new TextInputBuilder()
              .setCustomId('value')
              .setStyle(field === 'description' ? TextInputStyle.Paragraph : TextInputStyle.Short)
              .setRequired(false)
              .setMaxLength(field === 'nickname' ? 32 : 190)
              .setValue(botProfileSettings(interaction.guild.id)[field] || ''),
          ),
      );
    await interaction.showModal(modal);
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  try {
    if (field === 'reset') await botProfileService.reset(interaction.guild);
    else if (interaction.isModalSubmit()) {
      const value =
        field === 'avatar' || field === 'banner'
          ? await profileImage(
              interaction.fields.getUploadedFiles('image')?.first(),
              interaction.fields.getTextInputValue('url'),
            )
          : interaction.fields.getTextInputValue('value').trim();
      await botProfileService.update(interaction.guild, field, value);
    } else throw new Error('Open the current bot profile menu.');
    audit('bot_server_profile_changed', {
      guildId: interaction.guild.id,
      userId: interaction.user.id,
      field,
    });
    await interaction.editReply(
      botProfileView(interaction.guild, interaction.user.id, 'Server profile updated.'),
    );
  } catch {
    await interaction.editReply({
      content:
        'The profile could not be changed. Check the image format/size, bot permissions and Discord rate limits. The change never affects other servers.',
    });
  }
}
