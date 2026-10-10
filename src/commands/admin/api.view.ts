import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  ModalBuilder,
  ButtonInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  RepliableInteraction,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import {
  serviceCredentials,
  ServiceId,
  SERVICE_FIELDS,
} from '../../services/service-credentials.service';
import { CredentialKey } from '../../config/runtime-credentials';
import { requireAdminInteraction } from '../../utils/admin-interaction';
import { isOwner } from '../../utils/permissions';
import { audit } from '../../utils/logger';

export const SERVICE_LABELS: Record<ServiceId, string> = {
  challonge: 'Challonge',
  twitch: 'Twitch',
  youtube: 'YouTube API',
  webhooks: 'YouTube Webhook Secrets',
};
export function apiView(userId: string, service: ServiceId = 'challonge', notice?: string) {
  const owner = isOwner(userId);
  const embed = new EmbedBuilder()
    .setTitle('🔑 Service Connections')
    .setColor(0x5865f2)
    .setDescription(
      'The bot works without optional service keys. GameReplays, ModDB, public stats and YouTube RSS do not require these keys.\n\nShared installation keys can be changed only by the bot owner. Values are stored encrypted and are never shown in this menu. Do not enter Discord tokens, account passwords, or keys in chat.',
    )
    .addFields(
      ...(Object.keys(SERVICE_FIELDS) as ServiceId[]).map((s) => ({
        name: SERVICE_LABELS[s],
        value: serviceCredentials.status(s),
        inline: true,
      })),
    )
    .setFooter({
      text: 'Configured means not yet verified. Webhooks also need a host-configured public HTTPS callback URL.',
    });
  if (serviceCredentials.locked)
    embed.addFields({
      name: 'Credential Storage',
      value: 'Stored keys are locked. The bot owner must restore the private encryption key file.',
    });
  if (notice) embed.addFields({ name: 'Update', value: notice.slice(0, 1000) });
  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`service_api:select:${userId}`)
          .setPlaceholder('Choose a service')
          .addOptions(
            ...(Object.keys(SERVICE_FIELDS) as ServiceId[]).map((s) => ({
              label: SERVICE_LABELS[s],
              value: s,
              default: s === service,
            })),
          ),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`service_api:edit:${service}:${userId}`)
          .setLabel('Add / Update Keys')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(!owner || serviceCredentials.locked),
        new ButtonBuilder()
          .setCustomId(`service_api:check:${service}:${userId}`)
          .setLabel('Test Connections')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`service_api:disable:${service}:${userId}`)
          .setLabel('Disable Service')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(!owner || serviceCredentials.locked),
        new ButtonBuilder()
          .setCustomId(`service_api:environment:${service}:${userId}`)
          .setLabel('Use Host Settings')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(!owner || serviceCredentials.locked),
      ),
    ],
    allowedMentions: { parse: [] as [] },
  };
}
export async function openApi(interaction: RepliableInteraction) {
  if (!(await requireAdminInteraction(interaction))) return;
  await interaction.reply({ ...apiView(interaction.user.id), ephemeral: true });
}
export async function handleApi(
  bot: RA3Bot,
  interaction: ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction,
) {
  const parts = interaction.customId.split(':');
  const owner = parts.at(-1);
  if (owner !== interaction.user.id) {
    await interaction.reply({ content: 'Open your own /api menu.', ephemeral: true });
    return;
  }
  if (!(await requireAdminInteraction(interaction))) return;
  const action = parts[1];
  const service = (
    interaction.isStringSelectMenu() ? interaction.values[0] : parts[2]
  ) as ServiceId;
  if (!Object.hasOwn(SERVICE_FIELDS, service)) {
    await interaction.reply({ content: 'Choose a valid service in /api.', ephemeral: true });
    return;
  }
  if (action === 'select' && interaction.isStringSelectMenu()) {
    await interaction.update(apiView(interaction.user.id, service));
    return;
  }
  if (action !== 'check' && !isOwner(interaction.user.id)) {
    await interaction.reply({
      content: 'Only the bot owner can change shared service credentials.',
      ephemeral: true,
    });
    return;
  }
  if (action === 'edit' && interaction.isButton()) {
    const modal = new ModalBuilder()
      .setCustomId(`service_api:save:${service}:${interaction.user.id}`)
      .setTitle(SERVICE_LABELS[service]);
    for (const key of SERVICE_FIELDS[service])
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId(key)
            .setLabel(key.replace(/_/g, ' ').slice(0, 45))
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(1024)
            .setPlaceholder('Leave blank to keep the current value'),
        ),
      );
    await interaction.showModal(modal);
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  try {
    if (action === 'check') await serviceCredentials.checkAll();
    else if (action === 'save' && interaction.isModalSubmit()) {
      const fields: Partial<Record<CredentialKey, string>> = {};
      for (const key of SERVICE_FIELDS[service])
        fields[key] = interaction.fields.getTextInputValue(key);
      serviceCredentials.save(service, fields);
      await serviceCredentials.check(service);
      await bot.refreshServiceConfiguration();
    } else if (action === 'disable' || action === 'environment') {
      serviceCredentials.save(service, {}, action);
      await bot.refreshServiceConfiguration();
    } else throw new Error('Open the current /api menu.');
    if (action !== 'check')
      audit('service_credentials_changed', { userId: interaction.user.id, service, action });
    await interaction.editReply(
      apiView(
        interaction.user.id,
        service,
        'Connection settings refreshed. Missing, invalid or unavailable services do not stop the bot.',
      ),
    );
  } catch {
    await interaction.editReply({
      content:
        'The service settings could not be updated. Existing credentials were not displayed. Check the private encryption key and reopen /api.',
    });
  }
}
