import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ComponentType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { challongeService } from '../../services/challonge.service';
import { tournamentRepository } from '../../repositories/tournament.repository';
import { guildRepository } from '../../repositories/guild.repository';
import { logger } from '../../utils/logger';

export const data = new SlashCommandBuilder()
  .setName('report_score')
  .setDescription('Report a tournament match result')
  .addUserOption((option) =>
    option.setName('opponent').setDescription('Your opponent').setRequired(false),
  );

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Server only.', ephemeral: true });
    return;
  }

  const guildData = guildRepository.findByDiscordId(interaction.guild.id);
  if (guildData?.tournamentsEnabled === 0) {
    await interaction.reply({
      content: '❌ Tournaments are disabled on this server.',
      ephemeral: true,
    });
    return;
  }

  const tournamentId = tournamentRepository.getLinkedTournamentId(interaction.guild.id);
  if (!tournamentId) {
    await interaction.reply({
      content: 'No active tournament linked. Ask an admin to link one.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const matches = await challongeService.getMatches(tournamentId);
    const openMatches = matches.filter(
      (m) => m.state === 'open' && m.player1Id != null && m.player2Id != null,
    );
    if (openMatches.length === 0) {
      await interaction.editReply({ content: 'No open matches found.' });
      return;
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId('select_match')
      .setPlaceholder('Choose a match')
      .addOptions(
        openMatches.map((m) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(`Match ${m.identifier || m.id}`)
            .setValue(String(m.id)),
        ),
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
    await interaction.editReply({
      content: 'Select the match you want to report:',
      components: [row],
    });

    const replyMessage = await interaction.fetchReply();
    const collector = replyMessage.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 60_000,
    });

    collector.once('collect', async (selectInteraction) => {
      try {
        if (selectInteraction.user.id !== interaction.user.id) {
          await selectInteraction.reply({ content: 'Not your selection.', ephemeral: true });
          return;
        }
        const matchId = Number(selectInteraction.values[0]);
        const match = openMatches.find((m) => m.id === matchId);
        if (!match || match.player1Id == null || match.player2Id == null) {
          await selectInteraction.reply({ content: 'Match details are missing.', ephemeral: true });
          return;
        }

        const modal = new ModalBuilder()
          .setCustomId(`score_modal_${match.id}_${match.player1Id}_${match.player2Id}`)
          .setTitle('Report Match Score');
        const scoreInput = new TextInputBuilder()
          .setCustomId('score')
          .setLabel('Score (e.g., 3-1)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        const proofInput = new TextInputBuilder()
          .setCustomId('proof')
          .setLabel('Proof URL (screenshot/replay)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false);
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(scoreInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(proofInput),
        );
        await selectInteraction.showModal(modal);
      } catch (error) {
        logger.error('report_score: match selection failed:', error);
      }
    });
  } catch (error) {
    logger.error('report_score: failed to load matches:', error);
    await interaction.editReply({ content: 'Failed to load matches.' });
  }
}
