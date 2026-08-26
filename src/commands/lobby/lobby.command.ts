import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { lobbyService } from '../../services/lobby.service';
import { guildRepository } from '../../repositories/guild.repository';
import { CNC_ONLINE, RA3_BATTLE_NET } from '../../utils/emojis';
import { getGameContext } from '../../utils/game-context';

export const data = new SlashCommandBuilder()
  .setName('lobby')
  .setDescription('Show active lobbies for this server game');

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Server only.', ephemeral: true });
    return;
  }

  const guildData = await guildRepository.findByDiscordId(interaction.guild.id);
  if (guildData?.lobbyEnabled === 0) {
    await interaction.reply({
      content: 'Lobby tracker is disabled on this server.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const context = getGameContext(interaction.guild.id);
  const lobbies = await lobbyService.fetchActiveLobbies(context.game, context.sources);
  if (lobbies.length === 0) {
    await interaction.editReply({
      content: 'No active lobbies found right now. Start a game and invite friends!',
    });
    return;
  }

  const cncLobbies = lobbies.filter((l) => l.platform === 'C&C Online');
  const ra3bLobbies = lobbies.filter((l) => l.platform === 'RA3BattleNet');

  const embed = new EmbedBuilder()
    .setTitle(`Active ${context.config.shortLabel} Lobbies`)
    .setColor(context.config.color)
    .setThumbnail(context.config.artworkUrl);

  if (cncLobbies.length) {
    for (const lobby of cncLobbies.slice(0, 10)) {
      embed.addFields({
        name: `${CNC_ONLINE} ${lobby.map} (${lobby.mode})`,
        value: `Players: ${lobby.players.join(', ')}`,
        inline: false,
      });
    }
  }
  if (ra3bLobbies.length) {
    for (const lobby of ra3bLobbies.slice(0, 10)) {
      embed.addFields({
        name: `${RA3_BATTLE_NET} ${lobby.map} (${lobby.mode})`,
        value: `Players: ${lobby.players.join(', ')}`,
        inline: false,
      });
    }
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('lobby_help')
      .setLabel('How to join?')
      .setStyle(ButtonStyle.Primary),
  );
  await interaction.editReply({ embeds: [embed], components: [row] });
}
