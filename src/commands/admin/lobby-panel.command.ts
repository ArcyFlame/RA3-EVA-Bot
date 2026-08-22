import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  TextChannel,
  EmbedBuilder,
  ChannelType,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { lobbyPanelRepository } from '../../repositories/lobby-panel.repository';
import { denyUnlessAdmin } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';
import { lobbyService } from '../../services/lobby.service';
import { guildRepository } from '../../repositories/guild.repository';
import { CNC_ONLINE, RA3_BATTLE_NET } from '../../utils/emojis';
import { logger } from '../../utils/logger';

export const data = new SlashCommandBuilder()
  .setName('lobby_panel')
  .setDescription('Set up a persistent lobby status board')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub
      .setName('set')
      .setDescription('Set current channel as lobby panel')
      .addChannelOption((opt) =>
        opt.setName('channel').setDescription('Text channel').setRequired(true),
      ),
  )
  .addSubcommand((sub) => sub.setName('disable').setDescription('Disable lobby panel'));

export async function execute(bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
  if (!interaction.guild) {
    await interaction.editReply({ content: 'Server only.' });
    return;
  }
  const member = await resolveMember(interaction);
  const denial = denyUnlessAdmin(member);
  if (denial) {
    await interaction.editReply({ content: denial });
    return;
  }

  const sub = interaction.options.getSubcommand();
  if (sub === 'set') {
    const channel = interaction.options.getChannel('channel', true) as TextChannel;
    if (channel.type !== ChannelType.GuildText) {
      await interaction.editReply({ content: 'Must be a text channel.' });
      return;
    }
    const perms = channel.permissionsFor(bot.client.user!);
    if (!perms || !perms.has(['SendMessages', 'EmbedLinks'])) {
      await interaction.editReply({
        content: 'I need Send Messages and Embed Links permissions in that channel.',
      });
      return;
    }
    const embed = new EmbedBuilder()
      .setTitle('🎮 Live RA3 Lobbies')
      .setColor(0x5865f2)
      .setDescription('Loading lobbies...');
    const msg = await channel.send({ embeds: [embed] });
    lobbyPanelRepository.set(interaction.guild.id, channel.id, msg.id);
    await interaction.editReply({
      content: `✅ Lobby panel set in ${channel}. It will update every 3 minutes.`,
    });
    await updateLobbyPanel(bot, interaction.guild.id);
  } else if (sub === 'disable') {
    const existing = lobbyPanelRepository.get(interaction.guild.id);
    if (existing) {
      try {
        const channel = await interaction.guild.channels.fetch(existing.channelId);
        if (channel?.isTextBased())
          await (channel as TextChannel).messages.delete(existing.messageId);
      } catch {
        // Message may already be gone — proceed to delete the config.
      }
      lobbyPanelRepository.delete(interaction.guild.id);
    }
    await interaction.editReply({ content: 'Lobby panel disabled.' });
  }
}

async function updateLobbyPanel(bot: RA3Bot, guildId: string) {
  const panel = lobbyPanelRepository.get(guildId);
  if (!panel) return;
  const guild = bot.client.guilds.cache.get(guildId);
  if (!guild) return;
  const channel = guild.channels.cache.get(panel.channelId) as TextChannel;
  if (!channel) {
    lobbyPanelRepository.delete(guildId);
    return;
  }
  try {
    let msg = await channel.messages.fetch(panel.messageId).catch(() => null);
    const lobbies = await lobbyService.fetchActiveLobbies();
    const embed = new EmbedBuilder()
      .setTitle('🎮 Live RA3 Lobbies')
      .setColor(0x5865f2)
      .setTimestamp()
      .setFooter({ text: 'Updates every 3 minutes' });
    if (lobbies.length === 0) {
      embed.setDescription('No active lobbies found right now. Start a game and invite friends!');
    } else {
      for (const lobby of lobbies.slice(0, 10)) {
        const platformEmoji = lobby.platform === 'C&C Online' ? CNC_ONLINE : RA3_BATTLE_NET;
        embed.addFields({
          name: `${platformEmoji} ${lobby.map} (${lobby.mode})`,
          value: `Players: ${lobby.players.join(', ')}`,
          inline: false,
        });
      }
    }
    if (!msg) {
      msg = await channel.send({ embeds: [embed] });
      lobbyPanelRepository.set(guildId, panel.channelId, msg.id);
    } else {
      await msg.edit({ embeds: [embed] });
    }
  } catch (err) {
    logger.error(`Failed to update lobby panel for guild ${guildId}:`, err);
    // Only drop the config on a permanent failure (channel gone); a transient
    // network error must not disable the panel.
    if (!bot.client.channels.cache.get(panel.channelId)) {
      lobbyPanelRepository.delete(guildId);
    }
  }
}

export function startLobbyPanelUpdater(bot: RA3Bot) {
  const tick = async () => {
    // Guilds that bound a Lobby Updates channel via the setup wizard but never
    // ran /lobby_panel get an auto-created panel so the channel actually works.
    for (const guildData of guildRepository.getAllGuilds()) {
      if (guildData.lobbyEnabled === 0 || !guildData.lobbyChannelId) continue;
      if (lobbyPanelRepository.get(guildData.discordId)) continue;
      const guild = bot.client.guilds.cache.get(guildData.discordId);
      const channel = guild?.channels.cache.get(guildData.lobbyChannelId);
      if (!(channel instanceof TextChannel)) continue;
      try {
        const msg = await channel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle('🎮 Live RA3 Lobbies')
              .setColor(0x5865f2)
              .setDescription('Loading lobbies...'),
          ],
        });
        lobbyPanelRepository.set(guildData.discordId, channel.id, msg.id);
        logger.info(
          `Auto-created lobby panel in wizard-bound channel for guild ${guildData.discordId}`,
        );
      } catch (err) {
        logger.warn(`Could not auto-create lobby panel for guild ${guildData.discordId}:`, err);
      }
    }
    const panels = lobbyPanelRepository.getAll();
    for (const panel of panels) {
      await updateLobbyPanel(bot, panel.guildId);
    }
  };
  // First tick right away (boot), then every 3 minutes.
  tick().catch((err) => logger.error('Lobby panel tick failed:', err));
  const interval = setInterval(() => {
    tick().catch((err) => logger.error('Lobby panel tick failed:', err));
  }, 180000);
  interval.unref();
}
