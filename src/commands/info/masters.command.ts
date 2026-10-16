import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { buildMastersList } from './masters.view';
import { masterRosterRepository } from '../../repositories/master-roster.repository';
import { isModerator } from '../../utils/permissions';
import { getGameContext } from '../../utils/game-context';

export const data = new SlashCommandBuilder()
  .setName('masters')
  .setDescription('Show the Hall of Fame (all-time masters)');

export const guildOnly = false;

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const context = getGameContext(interaction.guildId);
  if (!context.mastersEnabled) {
    await interaction.editReply('Masters are disabled on this server.');
    return;
  }
  const member = interaction.guild
    ? await interaction.guild.members
        .fetch({ user: interaction.user.id, force: true })
        .catch(() => null)
    : null;
  const { entries, revision } = masterRosterRepository.snapshot(interaction.guildId, context.game);
  const embeds = buildMastersList(entries, context.game);
  const components =
    member && isModerator(member) && interaction.guildId
      ? [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(
                `masters:manage:${interaction.guildId}:${interaction.user.id}:${context.game}:0:${revision}:0`,
              )
              .setLabel('Manage Masters')
              .setStyle(ButtonStyle.Secondary),
          ),
        ]
      : [];
  await interaction.editReply({ embeds: [embeds[0]], components, allowedMentions: { parse: [] } });
  for (const embed of embeds.slice(1)) {
    await interaction.followUp({
      embeds: [embed],
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
  }
}
