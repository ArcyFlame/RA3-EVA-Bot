import {
  ActionRowBuilder,
  ButtonInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { isAdmin } from '../../utils/permissions';
import { guildRepository } from '../../repositories/guild.repository';
import { appSettingsRepository } from '../../repositories/app-settings.repository';

const tiers = ['bronze', 'silver', 'gold', 'diamond'] as const;
export async function manageReplayMedals(interaction: ButtonInteraction | ModalSubmitInteraction) {
  const member = await interaction.guild?.members
    .fetch({ user: interaction.user.id, force: true })
    .catch(() => null);
  if (
    interaction.customId !== `replay_medals:${interaction.user.id}` ||
    !member ||
    !isAdmin(member) ||
    guildRepository.findByDiscordId(member.guild.id)?.game !== 'genevo'
  ) {
    await interaction.reply({
      content: 'Only server admins can change replay medals.',
      ephemeral: true,
    });
    return;
  }
  if (interaction.isButton()) {
    const values = appSettingsRepository.getReplayMedals(member.guild.id);
    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(interaction.customId)
        .setTitle('Replay Medal Thresholds')
        .addComponents(
          ...tiers.map((tier) =>
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId(tier)
                .setLabel(`${tier[0].toUpperCase() + tier.slice(1)} - qualifying votes`)
                .setStyle(TextInputStyle.Short)
                .setValue(String(values[tier]))
                .setMinLength(1)
                .setMaxLength(5)
                .setRequired(true),
            ),
          ),
        ),
    );
    return;
  }
  const values = Object.fromEntries(
    tiers.map((tier) => {
      const text = interaction.fields.getTextInputValue(tier).trim();
      return [tier, /^\d+$/.test(text) ? Number(text) : NaN];
    }),
  ) as { bronze: number; silver: number; gold: number; diamond: number };
  try {
    appSettingsRepository.setReplayMedals(member.guild.id, values);
    await interaction.reply({
      content:
        'Medal thresholds saved for this server. /replays uses them immediately; existing cards update on their next refresh.',
      ephemeral: true,
    });
  } catch (error) {
    await interaction.reply({
      content: error instanceof Error ? error.message : 'Could not save medal thresholds.',
      ephemeral: true,
    });
  }
}
