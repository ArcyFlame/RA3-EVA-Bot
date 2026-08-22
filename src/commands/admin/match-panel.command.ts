import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  TextChannel,
  EmbedBuilder,
  ChannelType,
} from 'discord.js';
import { RA3Bot } from '../../bot';
import { matchPanelRepository } from '../../repositories/match-panel.repository';
import { tournamentRepository } from '../../repositories/tournament.repository';
import { denyUnlessAdmin } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';
import { challongeService } from '../../services/challonge.service';
import { logger } from '../../utils/logger';

export const data = new SlashCommandBuilder()
  .setName('match_panel')
  .setDescription('Set up a persistent tournament match ticker')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub
      .setName('set')
      .setDescription('Set current channel as match panel')
      .addChannelOption((opt) =>
        opt.setName('channel').setDescription('Text channel').setRequired(true),
      ),
  )
  .addSubcommand((sub) => sub.setName('disable').setDescription('Disable match panel'));

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
      .setTitle('🏆 Live Tournament Matches')
      .setColor(0x5865f2)
      .setDescription('Loading matches...');
    const msg = await channel.send({ embeds: [embed] });
    matchPanelRepository.set(interaction.guild.id, channel.id, msg.id);
    await interaction.editReply({
      content: `✅ Match panel set in ${channel}. It will update every 2 minutes.`,
    });
    await updateMatchPanel(bot, interaction.guild.id);
  } else if (sub === 'disable') {
    const existing = matchPanelRepository.get(interaction.guild.id);
    if (existing) {
      try {
        const channel = await interaction.guild.channels.fetch(existing.channelId);
        if (channel?.isTextBased())
          await (channel as TextChannel).messages.delete(existing.messageId);
      } catch {
        // Message may already be gone — proceed to delete the config.
      }
      matchPanelRepository.delete(interaction.guild.id);
    }
    await interaction.editReply({ content: 'Match panel disabled.' });
  }
}

async function updateMatchPanel(bot: RA3Bot, guildId: string) {
  const panel = matchPanelRepository.get(guildId);
  if (!panel) return;
  const guild = bot.client.guilds.cache.get(guildId);
  if (!guild) return;
  const channel = guild.channels.cache.get(panel.channelId) as TextChannel;
  if (!channel) {
    matchPanelRepository.delete(guildId);
    return;
  }
  let msg;
  try {
    msg = await channel.messages.fetch(panel.messageId);
  } catch (error) {
    // Transient failure or deleted message — keep the config and retry next tick.
    logger.warn(`Match panel message ${panel.messageId} unavailable - will retry:`, error);
    return;
  }

  const tournamentId = tournamentRepository.getLinkedTournamentId(guildId);
  if (!tournamentId) {
    const embed = new EmbedBuilder()
      .setTitle('🏆 Live Tournament Matches')
      .setColor(0x5865f2)
      .setDescription('No tournament linked. Use `/tournament_link`.');
    await msg.edit({ embeds: [embed] }).catch(() => null);
    return;
  }

  try {
    const [matches, participants] = await Promise.all([
      challongeService.getMatches(tournamentId),
      challongeService.getParticipants(tournamentId),
    ]);
    const participantNames = Object.fromEntries(participants.map((p) => [p.id, p.name]));
    const openMatches = matches.filter((m) => m.state === 'open' || m.state === 'pending');
    const embed = new EmbedBuilder()
      .setTitle('🏆 Live Tournament Matches')
      .setColor(0x5865f2)
      .setTimestamp()
      .setFooter({ text: 'Updates every 2 minutes' });
    if (openMatches.length === 0) {
      embed.setDescription('No ongoing or upcoming matches.');
    } else {
      embed.setDescription(`**${openMatches.length} match(es) in progress/pending**`);
      for (const m of openMatches.slice(0, 10)) {
        const p1 = participantNames[m.player1Id ?? 0] || 'TBD';
        const p2 = participantNames[m.player2Id ?? 0] || 'TBD';
        embed.addFields({
          name: `${p1} vs ${p2}`,
          value: `Status: ${m.state} | Round: ${m.round || '?'}`,
          inline: false,
        });
      }
    }
    await msg.edit({ embeds: [embed] });
  } catch (err) {
    logger.error('Failed to update match panel:', err);
  }
}

export function startMatchPanelUpdater(bot: RA3Bot) {
  const interval = setInterval(async () => {
    const panels = matchPanelRepository.getAll();
    for (const panel of panels) {
      await updateMatchPanel(bot, panel.guildId);
    }
  }, 120000); // every 2 minutes
  interval.unref();
}
