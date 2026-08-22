import { StringSelectMenuInteraction, EmbedBuilder, TextChannel, Client } from 'discord.js';
import { RA3Bot } from '../../bot';
import { twitchNotifier } from '../../services/twitch-notifier.service';
import { moddbNotifier } from '../../services/moddb-notifier.service';
import { newsRepository } from '../../repositories/news.repository';
import { guildRepository } from '../../repositories/guild.repository';

/** Test-post selector: `notif_test_select` (values: twitch | moddb | news). */
export const customId = 'notif_test_select';

export async function execute(bot: RA3Bot, interaction: StringSelectMenuInteraction) {
  if (!interaction.guild) return;
  const service = interaction.values[0];
  await interaction.deferReply({ ephemeral: true });
  const client: Client = bot.client;

  if (service === 'twitch') {
    const posted = await twitchNotifier.postTest(client);
    await interaction.editReply(
      posted > 0 ? '✅ Twitch test post sent to the configured channel.' : '❌ No Twitch channel configured (set it in Notification Channels).',
    );
    return;
  }

  if (service === 'moddb') {
    const posted = await moddbNotifier.postTest();
    await interaction.editReply(
      posted > 0
        ? '✅ ModDB test post sent (newest RA3 item).'
        : '❌ No RA3 ModDB item found right now, or no channel configured.',
    );
    return;
  }

  if (service === 'news') {
    const latest = newsRepository.getLatest(1)[0];
    const guildData = guildRepository.findByDiscordId(interaction.guild.id);
    const channel = guildData?.newsChannelId
      ? client.channels.cache.get(guildData.newsChannelId)
      : null;
    if (!(channel instanceof TextChannel) || !latest) {
      await interaction.editReply(
        '❌ Bind a News channel first (Notification Channels → RA3 News) and run /tournaments_scan once.',
      );
      return;
    }
    const embed = new EmbedBuilder()
      .setTitle(`📰 ${latest.title}`)
      .setURL(latest.newsUrl)
      .setColor(0x5865f2)
      .setDescription('🧪 News pipeline test - real posts look exactly like this.')
      .setTimestamp();
    await channel.send({ embeds: [embed] });
    await interaction.editReply(`✅ News test post sent to <#${channel.id}>.`);
    return;
  }

  await interaction.editReply('Unknown service.');
}
